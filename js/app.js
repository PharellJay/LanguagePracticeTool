// UI: settings → home → practice → summary. Plain DOM rendering into <main id="app">.

import * as srs from "./srs.js";
import * as storage from "./storage.js";
import * as speech from "./speech.js";
import { ensureTranslations, fetchLanguages } from "./translate.js";

const app = document.getElementById("app");

// How many extra new items "Learn more anyway" adds on top of the daily limit.
const EXTRA_BATCH = 10;

const state = {
  items: [],
  itemIds: [],
  byId: new Map(),
  categories: new Map(),
  settings: storage.loadSettings(),
  progress: null,
  screen: null,
  // Settings screen
  draft: null,
  languages: null,
  connection: { status: "idle", message: "" },
  formError: "",
  firstRun: false,
  // Practice
  session: null,
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const SPEAKER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;

function show(screen, html) {
  state.screen = screen;
  app.innerHTML = html;
  window.scrollTo(0, 0);
}

// ---------- Counts ----------

function counts(now = Date.now()) {
  const { cards } = state.progress;
  if (state.progress.daily.date !== storage.today()) {
    state.progress.daily = { date: storage.today(), newCount: 0 };
  }
  const due = Object.values(cards).filter((c) => state.byId.has(c.id) && srs.isDue(c, now)).length;
  const unseen = state.itemIds.filter((id) => !cards[id]).length;
  const newLeft = Math.min(unseen, Math.max(0, state.settings.newPerDay - state.progress.daily.newCount));
  return { due, unseen, newLeft, learned: srs.learnedCount(cards) };
}

function learnMoreBlock(unseen) {
  if (unseen === 0) return "";
  return `
    <div class="notice">
      <p>You've reached today's goal of ${state.settings.newPerDay} new items. You can keep going, but taking in
      a lot of new material at once usually means a big pile of reviews tomorrow, and less of it sticks than
      when you spread it over several days.</p>
      <button class="btn" data-action="learn-more">Learn ${Math.min(EXTRA_BATCH, unseen)} more anyway</button>
    </div>`;
}

// ---------- Home ----------

function renderHome() {
  const { due, unseen, newLeft, learned } = counts();
  const s = state.settings;
  let main;
  if (due + newLeft > 0) {
    main = `<button class="btn btn-primary btn-block" data-action="start">Start practice<kbd>Enter</kbd></button>`;
  } else if (unseen > 0) {
    main = `<p class="muted">All caught up on reviews for now.</p>${learnMoreBlock(unseen)}`;
  } else {
    main = `<p class="muted">You've seen every item. Come back later — reviews appear here when they're due.</p>`;
  }
  show("home", `
    <header class="topbar">
      <span class="brand">Language Practice</span>
      <button class="link" data-action="settings">Settings</button>
    </header>
    <div class="stack">
      <h1>${esc(s.targetName)}</h1>
      <p class="pair">You speak ${esc(s.nativeName)}</p>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-value">${due}</div><div class="stat-label">Due now</div></div>
      <div class="stat"><div class="stat-value">${newLeft}</div><div class="stat-label">New today</div></div>
      <div class="stat"><div class="stat-value">${learned}<span class="muted" style="font-size:1rem">/${state.itemIds.length}</span></div><div class="stat-label">Learned</div></div>
    </div>
    <div class="stack">${main}</div>
  `);
}

// ---------- Practice ----------

async function startSession(extraNew = 0) {
  const { newLeft } = counts();
  const queue = srs.buildQueue(state.itemIds, state.progress.cards, Date.now(), extraNew || newLeft);
  if (queue.length === 0) return renderHome();
  state.session = { queue, reviewed: 0, newLearned: 0, again: 0, revealed: false, target: null, native: null };
  await prepareSession();
}

async function prepareSession() {
  const session = state.session;
  const s = state.settings;
  show("preparing", `<p class="muted center">Preparing ${session.queue.length} cards…</p>`);
  const items = session.queue.map((id) => state.byId.get(id));
  const english = items.map((i) => i.english);
  const notes = items.filter((i) => i.note).map((i) => i.note);
  try {
    const [target, native] = await Promise.all([
      ensureTranslations(english, s.target, s),
      ensureTranslations([...english, ...notes], s.native, s),
      speech.voicesReady(),
    ]);
    session.target = target;
    session.native = native;
    renderCard();
  } catch (err) {
    show("prepare-error", `
      <div class="notice">
        <p>${esc(err.message)}</p>
        <div class="row">
          <button class="btn btn-primary" data-action="retry-prepare">Retry</button>
          <button class="btn" data-action="home">Back</button>
        </div>
      </div>`);
  }
}

function renderCard() {
  const session = state.session;
  const s = state.settings;
  const id = session.queue[0];
  const item = state.byId.get(id);
  const card = state.progress.cards[id] || srs.newCard(id);
  const isNew = !state.progress.cards[id];
  const total = session.reviewed + session.queue.length;
  const pct = Math.round((session.reviewed / total) * 100);
  const voice = speech.findVoice(s.target);
  const playTitle = voice ? "Read aloud" : `No ${s.targetName} voice is installed in this browser`;
  const now = Date.now();

  const meta = [state.categories.get(item.category) || item.category, item.type === "vocab" ? "Word" : "Sentence"];
  if (isNew) meta.push("New");

  const answer = session.revealed
    ? `<div class="answer">
         <p class="native" lang="${esc(s.native)}">${esc(session.native.get(item.english))}</p>
         ${item.note ? `<p class="note">${esc(session.native.get(item.note))}</p>` : ""}
       </div>`
    : "";

  const labels = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };
  const actions = session.revealed
    ? `<div class="grades">${srs.GRADES.map((g, i) => `
        <button class="grade" data-action="grade" data-grade="${g}">
          ${labels[g]}<small>${srs.previewDelay(card, g, now)}<kbd>${i + 1}</kbd></small>
        </button>`).join("")}</div>`
    : `<button class="btn btn-primary btn-block" data-action="reveal">Show translation<kbd>Space</kbd></button>`;

  show("card", `
    <div class="session-bar">
      <button class="link" data-action="end">End</button>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <span class="count">${session.reviewed}/${total}</span>
    </div>
    <section class="card">
      <p class="meta">${meta.map(esc).join(" · ")}</p>
      <p class="target" lang="${esc(s.target)}">${esc(session.target.get(item.english))}</p>
      <span class="play-wrap" title="${esc(playTitle)}">
        <button class="play" data-action="play" aria-label="${esc(playTitle)}" ${voice ? "" : "disabled"}>${SPEAKER_ICON}</button>
      </span>
      ${answer}
    </section>
    ${actions}
  `);
}

function play() {
  const session = state.session;
  const item = state.byId.get(session.queue[0]);
  const button = app.querySelector(".play");
  const started = speech.speak(session.target.get(item.english), state.settings.target, {
    onEnd: () => button && button.classList.remove("speaking"),
  });
  if (started && button) button.classList.add("speaking");
}

function reveal() {
  state.session.revealed = true;
  renderCard();
}

function grade(g) {
  const session = state.session;
  const { cards, daily } = state.progress;
  const id = session.queue[0];
  const now = Date.now();
  if (!cards[id]) {
    daily.newCount += 1;
    session.newLearned += 1;
  }
  const updated = srs.review(cards[id] || srs.newCard(id), g, now);
  cards[id] = updated;
  if (g === "again") session.again += 1;
  session.reviewed += 1;
  session.queue = srs.nextQueue(session.queue, updated, g, now);
  session.revealed = false;
  storage.saveProgress(state.settings.target, state.progress);
  speech.stop();
  if (session.queue.length) renderCard();
  else renderSummary();
}

function renderSummary() {
  speech.stop();
  const session = state.session;
  const { due, unseen, newLeft } = counts();
  const more = due + newLeft > 0
    ? `<button class="btn btn-primary btn-block" data-action="start">Continue (${due + newLeft} more)<kbd>Enter</kbd></button>`
    : newLeft === 0 ? learnMoreBlock(unseen) : "";
  show("summary", `
    <h1>Session complete</h1>
    <div class="stats">
      <div class="stat"><div class="stat-value">${session.reviewed}</div><div class="stat-label">Cards reviewed</div></div>
      <div class="stat"><div class="stat-value">${session.newLearned}</div><div class="stat-label">New items</div></div>
      <div class="stat"><div class="stat-value">${session.again}</div><div class="stat-label">To repeat</div></div>
    </div>
    <div class="stack">
      ${more}
      <button class="btn btn-block" data-action="home">Back to home</button>
    </div>
  `);
}

function endSession() {
  if (state.session && state.session.reviewed > 0) renderSummary();
  else {
    speech.stop();
    renderHome();
  }
}

// ---------- Settings ----------

function openSettings(firstRun = false) {
  state.firstRun = firstRun;
  state.draft = { ...state.settings };
  if (!state.draft.native) {
    const browser = (navigator.language || "en").split("-")[0];
    state.draft.native = browser;
  }
  state.formError = "";
  connect();
}

async function connect() {
  state.connection = { status: "connecting", message: "" };
  renderSettings();
  try {
    const langs = await fetchLanguages(state.draft.serverUrl);
    const en = langs.find((l) => l.code === "en");
    if (!en) throw new Error("This LibreTranslate server has no English model loaded. Start it with English included (e.g. --load-only en,es,de).");
    state.languages = langs
      .filter((l) => l.code === "en" || (en.targets || []).includes(l.code))
      .sort((a, b) => a.name.localeCompare(b.name));
    state.connection = { status: "ok", message: "" };
  } catch (err) {
    state.languages = null;
    state.connection = { status: "error", message: err.message };
  }
  if (state.screen === "settings") renderSettings();
}

function languageSelect(field, label) {
  const value = state.draft[field];
  const options = state.languages
    .map((l) => `<option value="${esc(l.code)}" ${l.code === value ? "selected" : ""}>${esc(l.name)}</option>`)
    .join("");
  const placeholder = state.languages.some((l) => l.code === value) ? "" : `<option value="" selected disabled>Choose…</option>`;
  return `
    <div class="field">
      <label for="f-${field}">${label}</label>
      <select id="f-${field}" data-field="${field}">${placeholder}${options}</select>
    </div>`;
}

function renderSettings() {
  const d = state.draft;
  const { status, message } = state.connection;
  let languages;
  if (status === "connecting") {
    languages = `<p class="muted">Connecting to the translation server…</p>`;
  } else if (status === "error") {
    languages = `
      <div class="notice">
        <p>${esc(message)}</p>
        <p>Start LibreTranslate on this computer, e.g. <code>libretranslate --load-only en,es,de</code>, then retry. The README has the full setup.</p>
        <button class="btn" data-action="connect">Retry</button>
      </div>`;
  } else if (status === "ok") {
    languages = languageSelect("native", "I speak") + languageSelect("target", "I want to learn");
  } else {
    languages = "";
  }

  show("settings", `
    <header class="topbar">
      <span class="brand">Language Practice</span>
      ${state.firstRun ? "" : `<button class="link" data-action="home">Cancel</button>`}
    </header>
    <div class="stack">
      <h1>${state.firstRun ? "Welcome" : "Settings"}</h1>
      ${state.firstRun ? `<p class="lead">Pick the language you speak and the one you want to learn. You'll practise sentences and words for everyday conversation, each with read-aloud.</p>` : ""}
    </div>
    <section class="group">
      <h2>Languages</h2>
      ${languages}
    </section>
    <section class="group">
      <h2>Daily goal</h2>
      <div class="field">
        <label for="f-newPerDay">New items per day</label>
        <input id="f-newPerDay" type="number" inputmode="numeric" min="1" max="100" value="${esc(d.newPerDay)}" data-field="newPerDay">
        <p class="hint">Reviews always appear when they're due. This only limits how many new items you get each day.</p>
      </div>
    </section>
    <details class="group" ${status === "error" ? "open" : ""}>
      <summary>Translation server</summary>
      <div class="field">
        <label for="f-serverUrl">LibreTranslate address</label>
        <input id="f-serverUrl" type="url" value="${esc(d.serverUrl)}" data-field="serverUrl" spellcheck="false">
      </div>
      <div class="field">
        <label for="f-apiKey">API key (optional)</label>
        <input id="f-apiKey" type="password" value="${esc(d.apiKey)}" data-field="apiKey" autocomplete="off">
        <p class="hint">Only needed if your server was started with API keys enabled.</p>
      </div>
      <div class="field"><button class="btn" data-action="connect">Connect</button></div>
    </details>
    ${state.formError ? `<p class="error">${esc(state.formError)}</p>` : ""}
    <button class="btn btn-primary btn-block" data-action="save" ${status === "ok" ? "" : "disabled"}>Save</button>
  `);
}

function saveSettingsForm() {
  const d = state.draft;
  const name = (code) => (state.languages.find((l) => l.code === code) || {}).name;
  if (!name(d.native) || !name(d.target)) {
    state.formError = "Choose both languages.";
    return renderSettings();
  }
  if (d.native === d.target) {
    state.formError = "Pick two different languages.";
    return renderSettings();
  }
  const newPerDay = Math.min(100, Math.max(1, parseInt(d.newPerDay, 10) || storage.DEFAULT_SETTINGS.newPerDay));
  const targetChanged = d.target !== state.settings.target;
  state.settings = { ...d, newPerDay, nativeName: name(d.native), targetName: name(d.target) };
  storage.saveSettings(state.settings);
  if (targetChanged || !state.progress) state.progress = storage.loadProgress(state.settings.target);
  renderHome();
}

// ---------- Events ----------

const actions = {
  start: () => startSession(),
  "learn-more": () => startSession(EXTRA_BATCH),
  "retry-prepare": () => prepareSession(),
  home: () => {
    speech.stop();
    renderHome();
  },
  settings: () => openSettings(false),
  connect: () => connect(),
  save: () => saveSettingsForm(),
  play: () => play(),
  reveal: () => reveal(),
  grade: (el) => grade(el.dataset.grade),
  end: () => endSession(),
};

app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el && !el.disabled) actions[el.dataset.action](el);
});

const updateDraft = (e) => {
  const field = e.target.dataset.field;
  if (field && state.draft) state.draft[field] = e.target.value;
};
app.addEventListener("input", updateDraft);
app.addEventListener("change", updateDraft);

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  // A focused button already handles Enter/Space natively.
  if (e.target.closest("button") && (e.key === "Enter" || e.key === " ")) return;
  if (state.screen === "card") {
    if (!state.session.revealed && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      reveal();
    } else if (state.session.revealed && ["1", "2", "3", "4"].includes(e.key)) {
      grade(srs.GRADES[Number(e.key) - 1]);
    } else if (e.key === "p" || e.key === "P") {
      if (speech.findVoice(state.settings.target)) play();
    }
  } else if ((state.screen === "home" || state.screen === "summary") && e.key === "Enter") {
    if (app.querySelector('[data-action="start"]') && document.activeElement === document.body) startSession();
  }
});

// ---------- Boot ----------

async function boot() {
  try {
    const res = await fetch("data/items.json");
    const data = await res.json();
    state.items = data.items;
    state.itemIds = data.items.map((i) => i.id);
    state.byId = new Map(data.items.map((i) => [i.id, i]));
    state.categories = new Map(data.categories.map((c) => [c.id, c.label]));
  } catch {
    show("error", `<div class="notice"><p>Could not load <code>data/items.json</code>. Open the site through a local web server (see the README) rather than as a file.</p></div>`);
    return;
  }
  if (!state.settings.native || !state.settings.target) {
    openSettings(true);
  } else {
    state.progress = storage.loadProgress(state.settings.target);
    renderHome();
  }
}

boot();
