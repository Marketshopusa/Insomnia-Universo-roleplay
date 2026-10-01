import { useEffect, useState, useRef } from "react";
import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { useLanguage } from "@/contexts/LanguageContext";

// In-memory cache shared across the app: key = `${lang}::${text}` -> translated
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<void>>();

function isLikelySpanish(text: string): boolean {
  // Quick heuristic: skip translation if text already contains Spanish accents/words
  return /[áéíóúñ¿¡]/i.test(text) || /\b(el|la|los|las|de|que|para|con|una|por)\b/i.test(text);
}

type TranslationJob = {
  texts: string[];
  targetLang: string;
  resolve: (translations: string[] | null) => void;
};
const translationJobs: TranslationJob[] = [];
let translationTimer: ReturnType<typeof setTimeout> | null = null;
let translationActive = false;

function scheduleTranslations() {
  if (translationTimer || translationActive) return;
  translationTimer = setTimeout(() => {
    translationTimer = null;
    void flushTranslations();
  }, 35);
}

async function flushTranslations() {
  if (translationActive || !translationJobs.length) return;
  translationActive = true;
  const first = translationJobs.shift()!;
  const jobs = [first];
  let size = first.texts.length;
  for (let i = 0; i < translationJobs.length && size < 50;) {
    const job = translationJobs[i];
    if (job.targetLang === first.targetLang && size + job.texts.length <= 50) {
      jobs.push(...translationJobs.splice(i, 1));
      size += job.texts.length;
    } else {
      i++;
    }
  }
  const texts = jobs.flatMap((job) => job.texts);
  let translations: string[] | null = null;
  try {
    const { data, error } = await invokeFunctionWithRetry<{ translations?: string[] }>("translate", {
      texts, targetLang: first.targetLang,
    });
    if (!error && data?.translations?.length === texts.length) translations = data.translations;
  } catch (error) {
    console.warn("Translate failed", error);
  } finally {
    let offset = 0;
    for (const job of jobs) {
      job.resolve(translations?.slice(offset, offset + job.texts.length) ?? null);
      offset += job.texts.length;
    }
    translationActive = false;
    scheduleTranslations();
  }
}

function translateBatch(texts: string[], targetLang: string): Promise<string[] | null> {
  if (!texts.length) return Promise.resolve([]);
  if (texts.length > 50) {
    const chunks = Array.from({ length: Math.ceil(texts.length / 50) }, (_, i) =>
      translateBatch(texts.slice(i * 50, (i + 1) * 50), targetLang)
    );
    return Promise.all(chunks).then((parts) => parts.every(Boolean) ? parts.flat() as string[] : null);
  }
  return new Promise((resolve) => {
    translationJobs.push({ texts, targetLang, resolve });
    scheduleTranslations();
  });
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
        .filter(Boolean) as Promise<void>[];

      if (toFetch.length > 0) {
        const batch = translateBatch(toFetch, language).then((arr) => {
          toFetch.forEach((text, i) => {
            if (arr && typeof arr[i] === "string") {
              cache.set(`${language}::${text}`, arr[i]);
            }
            inflight.delete(`${language}::${text}`);
          });
        });
        toFetch.forEach((t) => inflight.set(`${language}::${t}`, batch));
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
