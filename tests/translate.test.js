import assert from "node:assert/strict";
import { ensureTranslations, translateBatch, TranslationError } from "../js/translate.js";

const settings = { serverUrl: "http://localhost:5000/", apiKey: "" };

// Fake LibreTranslate: uppercases each text and records the batches it receives.
function fakeServer() {
  const calls = [];
  const fetchFn = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    return new Response(JSON.stringify({ translatedText: body.q.map((t) => `${body.target}:${t.toUpperCase()}`) }), {
      status: 200,
    });
  };
  return { calls, fetchFn };
}

Deno.test("translateBatch sends one batched request from English", async () => {
  const { calls, fetchFn } = fakeServer();
  const out = await translateBatch(["hello", "bye"], "es", settings, fetchFn);
  assert.deepEqual(out, ["es:HELLO", "es:BYE"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:5000/translate");
  assert.deepEqual(calls[0].body, { q: ["hello", "bye"], source: "en", target: "es", format: "text" });
});

Deno.test("ensureTranslations translates each text once and serves repeats from the cache", async () => {
  const { calls, fetchFn } = fakeServer();
  const texts = Array.from({ length: 45 }, (_, i) => `text ${i}`);
  const first = await ensureTranslations([...texts, "text 0"], "de", settings, fetchFn);
  assert.equal(first.size, 45);
  assert.equal(first.get("text 7"), "de:TEXT 7");
  assert.equal(calls.length, 3); // batches of 20 + 20 + 5

  const second = await ensureTranslations(texts.slice(0, 10), "de", settings, fetchFn);
  assert.equal(second.get("text 3"), "de:TEXT 3");
  assert.equal(calls.length, 3); // no new requests
});

Deno.test("English needs no translation", async () => {
  const { calls, fetchFn } = fakeServer();
  const out = await ensureTranslations(["hi"], "en", settings, fetchFn);
  assert.equal(out.get("hi"), "hi");
  assert.equal(calls.length, 0);
});

Deno.test("errors are reported with a kind", async () => {
  const offline = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(translateBatch(["x"], "es", settings, offline), (e) => e instanceof TranslationError && e.kind === "unreachable");

  const limited = async () => new Response("{}", { status: 429 });
  await assert.rejects(translateBatch(["x"], "es", settings, limited), (e) => e.kind === "rate-limited");

  const broken = async () => new Response(JSON.stringify({ error: "es is not supported" }), { status: 400 });
  await assert.rejects(translateBatch(["x"], "es", settings, broken), (e) => e.kind === "server" && e.message.includes("not supported"));
});
