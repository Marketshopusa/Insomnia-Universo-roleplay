import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

// In-memory cache shared across the app: key = `${lang}::${text}` -> translated
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function isLikelySpanish(text: string): boolean {
  // Quick heuristic: skip translation if text already contains Spanish accents/words
  return /[áéíóúñ¿¡]/i.test(text) || /\b(el|la|los|las|de|que|para|con|una|por)\b/i.test(text);
}

async function translateBatch(texts: string[], targetLang: string): Promise<string[]> {
  if (texts.length === 0) return [];
  const { data, error } = await supabase.functions.invoke("translate", {
    body: { texts, targetLang },
  });
  if (error || !data?.translations) {
    console.warn("Translate failed", error);
    return texts;
  }
  return data.translations as string[];
}

/**
 * Translates a list of strings to the active UI language.
 * - Returns originals immediately if language is "en".
 * - Caches results in-memory.
 * - Returns the originals while a translation is in flight, then updates.
 */
export function useTranslatedTexts(texts: (string | null | undefined)[]): string[] {
  const { language } = useLanguage();
  const safe = texts.map((t) => (t ?? "").toString());

  const [result, setResult] = useState<string[]>(safe);
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    const key = `${language}::${safe.join("§")}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    if (language === "en") {
      setResult(safe);
      return;
    }

    // Build the list of items needing translation
    const needsFetch: { idx: number; text: string; cacheKey: string }[] = [];
    const initial: string[] = safe.map((text, idx) => {
      if (!text || text.trim().length === 0) return text;
      if (isLikelySpanish(text) && language === "es") return text;
      const cacheKey = `${language}::${text}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      needsFetch.push({ idx, text, cacheKey });
      return text; // show original until translated
    });

    setResult(initial);

    if (needsFetch.length === 0) return;

    let cancelled = false;

    (async () => {
      const uniqueTexts = Array.from(new Set(needsFetch.map((n) => n.text)));
      const toFetch = uniqueTexts.filter((t) => !cache.has(`${language}::${t}`));
      const pending = uniqueTexts
        .map((t) => inflight.get(`${language}::${t}`))
        .filter(Boolean) as Promise<string>[];

      if (toFetch.length > 0) {
        const batch = translateBatch(toFetch, language).then((arr) => {
          toFetch.forEach((text, i) => {
            cache.set(`${language}::${text}`, arr[i] ?? text);
            inflight.delete(`${language}::${text}`);
          });
        });
        toFetch.forEach((t) => inflight.set(`${language}::${t}`, batch as unknown as Promise<string>));
        await batch;
      }
      if (pending.length > 0) await Promise.all(pending);

      if (cancelled) return;
      const final = safe.map((text) => {
        if (!text) return text;
        if (isLikelySpanish(text) && language === "es") return text;
        return cache.get(`${language}::${text}`) || text;
      });
      setResult(final);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, safe.join("§")]);

  return result;
}

export function useTranslatedText(text: string | null | undefined): string {
  const [result] = useTranslatedTexts([text]);
  return result ?? "";
}
