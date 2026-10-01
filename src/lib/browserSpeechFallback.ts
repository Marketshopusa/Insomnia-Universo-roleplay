/**
 * Backup speech from the device. The installed browser/OS voice can differ from
 * the selected Gemini voice, so callers should notify the listener when used.
 */
export async function speakWithDeviceVoice(
  text: string,
  language: string,
  signal: AbortSignal,
  onStart: () => void,
): Promise<void> {
  const synthesizer = window.speechSynthesis;
  if (!synthesizer || typeof SpeechSynthesisUtterance === "undefined") {
    throw new Error("device_voice_unavailable");
  }

  const locale = language === "es" ? "es-ES" : "en-US";
  const available = synthesizer.getVoices();
  const matching = available.filter((voice) => voice.lang.toLowerCase().startsWith(language.toLowerCase()));
  const voice = matching.find((candidate) => /natural|neural|online/i.test(candidate.name)) ?? matching[0];
  const clean = text.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return;
  // Short utterances avoid browsers silently cutting off a long paragraph.
  const pieces = clean.match(/.{1,180}(?:\s|$)|\S{1,180}/g)?.map((piece) => piece.trim()).filter(Boolean) ?? [clean];

  return new Promise<void>((resolve, reject) => {
    let nextIndex = 0;
    let finished = false;
    let started = false;
    let startTimer: number | undefined;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(startTimer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      synthesizer.cancel();
      finish();
    };
    const speakNext = () => {
      if (signal.aborted) { abort(); return; }
      if (nextIndex >= pieces.length) { finish(); return; }
      const utterance = new SpeechSynthesisUtterance(pieces[nextIndex++]);
      utterance.lang = voice?.lang || locale;
      if (voice) utterance.voice = voice;
      utterance.rate = 1;
      utterance.onstart = () => {
        if (started) return;
        started = true;
        window.clearTimeout(startTimer);
        onStart();
      };
      utterance.onend = () => { window.setTimeout(speakNext, 0); };
      utterance.onerror = (event) => {
        if (signal.aborted || event.error === "canceled" || event.error === "interrupted") { finish(); return; }
        finish(new Error("device_voice_failed"));
      };
      synthesizer.speak(utterance);
      if (!started) {
        startTimer = window.setTimeout(() => {
          synthesizer.cancel();
          finish(new Error("device_voice_start_timeout"));
        }, 6000);
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    synthesizer.cancel();
    speakNext();
  });
}
