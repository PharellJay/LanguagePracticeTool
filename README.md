# LanguagePracticeTool

Practise the sentences and words you actually need for everyday conversation and small talk — in any
language pair. Pick the language you speak and the one you want to learn; every item has read-aloud, and
spaced repetition decides what to show so you don't see the same thing over and over, but everything comes
back often enough to stick.

A static site (HTML, CSS, vanilla JavaScript modules — no build step, no dependencies). All learning
content is written once in English and translated on demand by a self-hosted
[LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) server.

## Run it

### 1. Start LibreTranslate

LibreTranslate is free, open source and has no usage limits when you host it yourself. The first start
downloads the language models (a few hundred MB per language). `--load-only` keeps it to the languages
you need — **always include `en`**, since all content is translated from English.

**Docker**
```bash
docker run -ti --rm -p 5000:5000 libretranslate/libretranslate --load-only en,es,de,fr
```

**Python** (LibreTranslate supports Python 3.8–3.13; with [uv](https://docs.astral.sh/uv/) you don't need
to install that Python version yourself)
```bash
uv tool install --python 3.12 libretranslate
libretranslate --load-only en,es,de,fr
```

It listens on `http://localhost:5000`, which is the app's default. A different address (or an API key, if
you started the server with `--api-keys`) can be set under **Settings → Translation server**.

### 2. Serve the site
```bash
python3 -m http.server 8000
# open http://localhost:8000
```
Opening `index.html` directly does not work: browsers block loading `data/items.json` from `file://`.

## How it works

| Part | File |
|------|------|
| Screens, practice flow, keyboard shortcuts | `js/app.js` |
| Spaced repetition (pure logic) | `js/srs.js` |
| LibreTranslate client, batching, errors | `js/translate.js` |
| Translation cache (IndexedDB) | `js/cache.js` |
| Read-aloud (Web Speech API) | `js/speech.js` |
| Settings and progress (localStorage) | `js/storage.js` |
| Learning content | `data/items.json` |

**Translation.** Each English text is translated once per language and cached in the browser's IndexedDB,
so practising needs the server only for items you haven't seen in that language yet. Texts are sent in
batches of 20. The cache key is the English text itself, so editing an item fetches a fresh translation.

**Read-aloud.** Uses the browser's built-in speech synthesis — free, no limits, no server. Which languages
have a voice depends on the browser and OS (Chrome and Edge ship many; Firefox on Linux may have few). If no
voice exists for the language you're learning, the play button is disabled and its tooltip says why.

**Spaced repetition** (simplified SM-2, as used by Anki):
- New items are introduced up to the daily goal (default 10, set in Settings). Due reviews always come first,
  most overdue first. Cards that aren't due are never shown.
- **Again** → back in the same session a few cards later, interval reset.
  **Hard** → slower growth (on a new card: back in 10 minutes). **Good** → interval × ease (ease starts at
  2.5). **Easy** → faster growth. Each button shows when the card would come back.
- After the daily goal you can keep going with **Learn 10 more anyway** — the app warns that cramming many
  new items at once means more reviews later and lower retention.
- Progress is stored per language you're learning, so switching languages keeps each one's history.

**Keyboard:** `Space` / `Enter` shows the translation, `1`–`4` grades, `P` reads aloud.

## Add or edit content

Everything lives in `data/items.json` — no code changes needed:

```json
{ "id": "food-17", "type": "sentence", "category": "food", "english": "Could we have the check, please?", "note": "Optional hint, shown with the translation" }
```

- `id` must be unique and should never change once used (progress is keyed by it).
- `type` is `sentence` or `vocab`.
- `category` must match an `id` in the `categories` list at the top of the file; add a new category there.
- Items are introduced in file order, so put the most useful ones first.
- Prefer unambiguous English for single words ("on the right", "the bill") — machine translation has no
  context to guess from.

## Tests

```bash
deno test tests/
```
Covers the scheduler (new item introduction, interval growth, resets, due ordering, in-session repeats)
and the translation client (batching, caching, error handling) against a fake server.

## Hosting

Any static host works (GitHub Pages, Netlify, Cloudflare Pages). Each visitor's browser talks to the
LibreTranslate address in their settings — `localhost:5000` only works for someone running LibreTranslate
on their own machine. To let other people use a hosted version, run LibreTranslate on a public server
(ideally with `--req-limit` and `--api-keys`) and set that address as the default `serverUrl` in
`js/storage.js`.

## Known limitations

- Translations are machine-generated and can be wrong or unnatural, especially for short phrases and
  single words without context. All languages are translated via English.
- Read-aloud quality and availability depend on the voices installed in the browser/OS.
- Progress is stored in the browser only: clearing site data resets it, and it doesn't sync between devices.
