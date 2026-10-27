import assert from "node:assert/strict";
import { buildQueue, DAY, MINUTE, newCard, nextQueue, previewDelay, review } from "../js/srs.js";

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const ids = ["a", "b", "c", "d", "e"];

Deno.test("new items are introduced up to the limit, in content order, after due reviews", () => {
  const cards = { c: { ...newCard("c"), reps: 1, interval: 1, due: NOW - MINUTE } };
  assert.deepEqual(buildQueue(ids, cards, NOW, 2), ["c", "a", "b"]);
  assert.deepEqual(buildQueue(ids, cards, NOW, 0), ["c"]);
  assert.deepEqual(buildQueue(ids, {}, NOW, 10), ids);
});

Deno.test("due cards come first (most overdue first); cards not yet due are left out", () => {
  const cards = {
    a: { ...newCard("a"), reps: 2, interval: 3, due: NOW + DAY }, // not due
    b: { ...newCard("b"), reps: 1, interval: 1, due: NOW - MINUTE }, // due a minute ago
    c: { ...newCard("c"), reps: 1, interval: 1, due: NOW - DAY }, // due a day ago
  };
  const queue = buildQueue(ids, cards, NOW, 1);
  assert.deepEqual(queue, ["c", "b", "d"]);
  assert.ok(!queue.includes("a"));
});

Deno.test("intervals grow with each correct answer", () => {
  let card = review(newCard("x"), "good", NOW);
  assert.equal(card.interval, 1);
  assert.equal(card.due, NOW + DAY);

  const intervals = [card.interval];
  let t = NOW;
  for (let i = 0; i < 4; i++) {
    t = card.due;
    card = review(card, "good", t);
    intervals.push(card.interval);
  }
  for (let i = 1; i < intervals.length; i++) assert.ok(intervals[i] > intervals[i - 1], `intervals: ${intervals}`);
  assert.equal(card.reps, 5);
});

Deno.test("easy grows faster than good, hard slower", () => {
  const base = { ...newCard("x"), reps: 2, interval: 6, due: NOW };
  const hard = review(base, "hard", NOW).interval;
  const good = review(base, "good", NOW).interval;
  const easy = review(base, "easy", NOW).interval;
  assert.ok(hard < good && good < easy, `${hard} ${good} ${easy}`);
  assert.ok(hard > base.interval);
});

Deno.test("again resets a learned card's interval and lowers its ease", () => {
  const learned = { ...newCard("x"), reps: 4, interval: 20, ease: 2.5, due: NOW };
  const card = review(learned, "again", NOW);
  assert.equal(card.reps, 0);
  assert.equal(card.interval, 0);
  assert.equal(card.lapses, 1);
  assert.ok(card.ease < 2.5);
  assert.equal(card.due, NOW + MINUTE);
});

Deno.test("ease never drops below 1.3", () => {
  let card = { ...newCard("x"), reps: 1, interval: 1, ease: 1.35 };
  for (let i = 0; i < 5; i++) card = review({ ...card, reps: 1, interval: 1 }, "again", NOW);
  assert.equal(card.ease, 1.3);
});

Deno.test("hard on a card still being learned keeps it in learning for 10 minutes", () => {
  const card = review(newCard("x"), "hard", NOW);
  assert.equal(card.reps, 0);
  assert.equal(card.due, NOW + 10 * MINUTE);
});

Deno.test("review does not mutate the input card", () => {
  const card = newCard("x");
  const copy = { ...card };
  review(card, "easy", NOW);
  assert.deepEqual(card, copy);
});

Deno.test("cards due again soon come back later in the same session; others leave the queue", () => {
  const queue = ["a", "b", "c", "d", "e"];
  const again = review(newCard("a"), "again", NOW);
  assert.deepEqual(nextQueue(queue, again, "again", NOW), ["b", "c", "d", "a", "e"]);

  const good = review(newCard("a"), "good", NOW);
  assert.deepEqual(nextQueue(queue, good, "good", NOW), ["b", "c", "d", "e"]);

  // With few cards left, the card goes to the end instead of disappearing.
  assert.deepEqual(nextQueue(["a", "b"], again, "again", NOW), ["b", "a"]);
  assert.deepEqual(nextQueue(["a"], again, "again", NOW), ["a"]);
});

Deno.test("preview labels show when a card comes back", () => {
  const card = newCard("x");
  assert.equal(previewDelay(card, "again", NOW), "1m");
  assert.equal(previewDelay(card, "hard", NOW), "10m");
  assert.equal(previewDelay(card, "good", NOW), "1d");
  assert.equal(previewDelay(card, "easy", NOW), "4d");
});
