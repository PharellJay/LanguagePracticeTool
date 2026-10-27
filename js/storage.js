// Settings and learning progress, kept in localStorage.
// Every access is wrapped in try/catch: storage can be blocked (private mode, disabled site data),
// in which case the app still works for the current visit.

const SETTINGS_KEY = "lpt.settings";
const PROGRESS_PREFIX = "lpt.progress.";

export const DEFAULT_SETTINGS = {
  native: "",
  nativeName: "",
  target: "",
  targetName: "",
  serverUrl: "http://localhost:5000",
  apiKey: "",
  newPerDay: 10,
};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY) };
}

export function saveSettings(settings) {
  return write(SETTINGS_KEY, settings);
}

export function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Progress is stored per target language, so switching languages keeps each one's history.
// The daily counter tracks how many new items were introduced today.
export function loadProgress(target) {
  const p = read(PROGRESS_PREFIX + target) || {};
  const daily = p.daily && p.daily.date === today() ? p.daily : { date: today(), newCount: 0 };
  return { cards: p.cards || {}, daily };
}

export function saveProgress(target, progress) {
  return write(PROGRESS_PREFIX + target, progress);
}
