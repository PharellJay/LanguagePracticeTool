// Read-aloud via the browser's built-in Web Speech API (free, no usage limits).
// Which languages have a voice depends on the browser and operating system.

// LibreTranslate codes that differ from the BCP 47 tags that speech voices use.
const VOICE_LANG = {
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
  zh: "zh-CN",
  pb: "pt-BR",
  nb: "no",
};

const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;

export function isSupported() {
  return Boolean(synth);
}

// Voices load asynchronously in some browsers; wait briefly for them.
export function voicesReady() {
  if (!synth) return Promise.resolve([]);
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

export function findVoice(lang) {
  if (!synth) return null;
  const wanted = (VOICE_LANG[lang] || lang).toLowerCase();
  const primary = wanted.split("-")[0];
  const alias = primary === "no" ? "nb" : primary === "nb" ? "no" : primary;
  const voices = synth.getVoices();
  const norm = (v) => v.lang.toLowerCase().replace("_", "-");
  return (
    voices.find((v) => norm(v) === wanted) ||
    voices.find((v) => norm(v).split("-")[0] === primary && v.localService) ||
    voices.find((v) => norm(v).split("-")[0] === primary) ||
    voices.find((v) => norm(v).split("-")[0] === alias) ||
    null
  );
}

export function speak(text, lang, { onEnd } = {}) {
  const voice = findVoice(lang);
  if (!voice) return false;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = 0.95;
  if (onEnd) utterance.onend = utterance.onerror = onEnd;
  synth.speak(utterance);
  return true;
}

export function stop() {
  if (synth) synth.cancel();
}
