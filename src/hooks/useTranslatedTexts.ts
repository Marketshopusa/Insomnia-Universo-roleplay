import { useEffect, useState, useRef } from "react";
import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { useLanguage } from "@/contexts/LanguageContext";
import { findStaticTranslation } from "@/lib/staticTranslations";

// In-memory cache shared across the app: key = `${lang}::${text}` -> translated
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<void>>();

function isLikelySpanish(text: string): boolean {
  if (/[áíóúñ¿¡]/i.test(text)) return true;
  const spanishHits = (text.toLowerCase().match(/\b(el|la|los|las|del|que|para|por|una|unos|unas|está|estoy|historia|relato|capítulo|noche|amor)\b/g) || []).length;
  return spanishHits >= 2;
}

function isLikelyEnglish(text: string): boolean {
  const englishHits = (text.toLowerCase().match(/\b(the|this|that|with|and|your|under|after|before|night|when|love|chapter|episode)\b/g) || []).length;
  return englishHits >= 2;
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
    if (!error && Array.isArray(data?.translations) && data.translations.length === texts.length) {
      translations = data.translations;
    }
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

function resolveSingleText(text: string, language: string): { translated: string; needsFetch: boolean } {
  if (!text || !text.trim()) return { translated: text, needsFetch: false };
  const staticMatch = findStaticTranslation(text, language);
  if (staticMatch) return { translated: staticMatch, needsFetch: false };

  const cacheKey = `${language}::${text}`;
  const cached = cache.get(cacheKey);
  if (cached) return { translated: cached, needsFetch: false };

  if (language === "es" && isLikelySpanish(text)) return { translated: text, needsFetch: false };
  if (language === "en" && isLikelyEnglish(text)) return { translated: text, needsFetch: false };

  return { translated: text, needsFetch: true };
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Translates a list of strings to the active UI language.
 * - Uses immediate static dictionary if available.
 * - Caches results in-memory.
 * - Falls back to Gemini translation API for dynamic texts.
 */
export function useTranslatedTexts(texts: (string | null | undefined)[]): string[] {
  const { language } = useLanguage();
  const safe = texts.map((t) => (t ?? "").toString());

  const computeCurrent = (): string[] =>
    safe.map((t) => resolveSingleText(t, language).translated);

  const [result, setResult] = useState<string[]>(computeCurrent);
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    const key = `${language}::${safe.join("§")}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    const needsFetch: string[] = [];
    const initial = safe.map((text) => {
      const { translated, needsFetch: req } = resolveSingleText(text, language);
      if (req) needsFetch.push(text);
      return translated;
    });

    setResult((prev) => (arraysEqual(prev, initial) ? prev : initial));
    if (needsFetch.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const unique = Array.from(new Set(needsFetch)).filter((t) => !cache.has(`${language}::${t}`));
        if (unique.length > 0) {
          const batch = translateBatch(unique, language).then((arr) => {
            if (Array.isArray(arr)) {
              unique.forEach((text, i) => {
                if (typeof arr[i] === "string" && arr[i].trim()) {
                  cache.set(`${language}::${text}`, arr[i]);
                }
              });
            }
          }).catch((err) => {
            console.warn("Translation batch error:", err);
          });
          await batch;
        }

        if (cancelled) return;
        const final = safe.map((text) => {
          const direct = resolveSingleText(text, language);
          if (!direct.needsFetch) return direct.translated;
          return cache.get(`${language}::${text}`) || direct.translated;
        });
        setResult((prev) => (arraysEqual(prev, final) ? prev : final));
      } catch (err) {
        console.warn("Translation effect error:", err);
      }
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
