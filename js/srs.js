// Spaced repetition: a simplified SM-2 scheduler.
// Pure functions only (no DOM, no storage) so it can be unit-tested with `deno test`.

export const GRADES = ["again", "hard", "good", "easy"];

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

const START_EASE = 2.5;
const MIN_EASE = 1.3;

// How many cards later a card comes back in the same session when it is due again soon.
const REQUEUE_OFFSET = { again: 3, hard: 6 };

export function newCard(id) {
  return { id, reps: 0, interval: 0, ease: START_EASE, due: 0, lapses: 0, seen: 0 };
}

export function isDue(card, now = Date.now()) {
  return card.due <= now;
}

// Returns a new card object; the input card is never mutated.
// `reps` counts successful reviews in a row; 0 means the card is new or still being learned.
export function review(card, grade, now = Date.now()) {
  if (!GRADES.includes(grade)) throw new Error(`Unknown grade: ${grade}`);
  const c = { ...card, seen: card.seen + 1, last: now };

  if (grade === "again") {
    if (c.reps > 0) {
      c.lapses += 1;
      c.ease = Math.max(MIN_EASE, c.ease - 0.2);
    }
    c.reps = 0;
    c.interval = 0;
    c.due = now + MINUTE;
    return c;
  }

  if (c.reps === 0) {
    if (grade === "hard") {
      // Still shaky: stay in learning and show it again shortly.
      c.due = now + 10 * MINUTE;
      return c;
    }
    c.interval = grade === "easy" ? 4 : 1;
    if (grade === "easy") c.ease += 0.15;
  } else if (grade === "hard") {
    c.ease = Math.max(MIN_EASE, c.ease - 0.15);
    c.interval = Math.max(c.interval + 1, Math.round(c.interval * 1.2));
  } else if (grade === "good") {
    c.interval = Math.max(c.interval + 1, Math.round(c.interval * c.ease));
  } else {
    c.ease += 0.15;
    c.interval = Math.max(c.interval + 1, Math.round(c.interval * c.ease * 1.3));
  }

  c.reps += 1;
  c.due = now + c.interval * DAY;
  return c;
}

// Short label for when a card would come back after the given grade, e.g. "1m", "10m", "3d".
export function previewDelay(card, grade, now = Date.now()) {
  return formatDelay(review(card, grade, now).due - now);
}

export function formatDelay(ms) {
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(ms / (60 * MINUTE));
  if (hours < 24) return `${hours}h`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

// Builds a session queue: due cards first (most overdue first), then up to `newLimit` new items
// in content order. Cards that are not due yet are left out.
export function buildQueue(itemIds, cards, now = Date.now(), newLimit = 0) {
  const due = [];
  const fresh = [];
  for (const id of itemIds) {
    const card = cards[id];
    if (!card) fresh.push(id);
    else if (isDue(card, now)) due.push(card);
  }
  due.sort((a, b) => a.due - b.due);
  return [...due.map((c) => c.id), ...fresh.slice(0, Math.max(0, newLimit))];
}

// After grading the card at the front of `queue`, returns the remaining queue.
// Cards that come back within the hour are put back a few positions later in the same session.
export function nextQueue(queue, gradedCard, grade, now = Date.now()) {
  const rest = queue.slice(1);
  const offset = REQUEUE_OFFSET[grade];
  if (offset !== undefined && gradedCard.due - now < 60 * MINUTE) {
    rest.splice(Math.min(offset, rest.length), 0, gradedCard.id);
  }
  return rest;
}

// Count of cards that have been answered correctly at least once.
export function learnedCount(cards) {
  return Object.values(cards).filter((c) => c.reps > 0 || c.interval > 0).length;
}
