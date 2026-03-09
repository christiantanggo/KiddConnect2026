#!/usr/bin/env node
/**
 * Unit tests for Orbix hook rewriter (rewriteHookForShorts).
 * Run: node scripts/test-orbix-hook-rewriter.js
 */

import assert from 'assert';
import { rewriteHookForShorts, isHookCompliant } from '../services/orbix-network/script-generator.js';

const MAX_LINES = 2;
const MAX_WORDS_PER_LINE = 14;
const HIGH_RETENTION_MIN_WORDS = 4;
const HIGH_RETENTION_MAX_WORDS = 8; // psychology
const BANNED = ['might', 'may', 'can', 'often', 'sometimes'];

function wordCountTotal(s) {
  return (s || '').split(/\s+/).filter(Boolean).length;
}

function countLines(s) {
  return (s || '').split(/\n/).filter(Boolean).length;
}
function wordCountPerLine(s) {
  return (s || '')
    .split(/\n/)
    .map((line) => line.trim().split(/\s+/).filter(Boolean).length);
}

function assertNotEmpty(actual) {
  assert(actual != null && String(actual).trim().length > 0, `Expected non-empty hook, got: ${actual}`);
}

function assertMaxTwoLines(actual) {
  const n = countLines(actual);
  assert(n <= MAX_LINES, `Expected ≤${MAX_LINES} lines, got ${n}: ${actual}`);
}

function assertMaxWordsPerLine(actual) {
  const counts = wordCountPerLine(actual);
  const bad = counts.filter((c) => c > MAX_WORDS_PER_LINE);
  assert(bad.length === 0, `Expected each line ≤${MAX_WORDS_PER_LINE} words, got word counts: ${counts.join(', ')}`);
}

function assertNoBannedWords(actual) {
  const lower = (actual || '').toLowerCase();
  for (const word of BANNED) {
    const re = new RegExp('\\b' + word + '\\b');
    assert(!re.test(lower), `Expected no banned word "${word}" in: ${actual}`);
  }
}

console.log('Running Orbix hook rewriter tests...\n');

// Ensures ≤2 lines
assertMaxTwoLines(rewriteHookForShorts('One line hook.', 'psychology'));
assertMaxTwoLines(rewriteHookForShorts('First line. Second line.', 'psychology'));
assertMaxTwoLines(
  rewriteHookForShorts(
    'This is a very long hook that could span many many many many many many many many many many many many many many many lines if we did not truncate.',
    'psychology'
  )
);
console.log('✓ ≤2 lines');

// Psychology: 4–8 words (rewriter caps at 8)
const psychRewritten = rewriteHookForShorts('Your brain deletes most of reality and you only notice what fits.', 'psychology');
assert(wordCountTotal(psychRewritten) <= HIGH_RETENTION_MAX_WORDS, `Psychology hook must be ≤${HIGH_RETENTION_MAX_WORDS} words, got ${wordCountTotal(psychRewritten)}: ${psychRewritten}`);
console.log('✓ Psychology: ≤8 words');
// Other: each line ≤14 words
assertMaxWordsPerLine(rewriteHookForShorts('You think you spend with logic. You don\'t.', 'other'));
console.log('✓ other: each line ≤14 words');

// Ensures no banned hedging words (rewriter strips them)
assertNoBannedWords(rewriteHookForShorts('You might think this is obvious.', 'psychology'));
assertNoBannedWords(rewriteHookForShorts('Often people might forget that bias may be subtle.', 'psychology'));
console.log('✓ no banned hedging words');

// Ensures not empty
assertNotEmpty(rewriteHookForShorts('Hello world', 'other'));
assertNotEmpty(rewriteHookForShorts('  Your brain hides this from you.  ', 'psychology'));
assertNotEmpty(rewriteHookForShorts('Might might might might', 'psychology')); // fallback to truncated original
console.log('✓ not empty');

// Edge cases
assert.strictEqual(rewriteHookForShorts('', 'psychology'), '');
assert.strictEqual(rewriteHookForShorts('   ', 'psychology'), '');
assert.strictEqual(rewriteHookForShorts(null, 'other'), '');
assert.strictEqual(rewriteHookForShorts(undefined, 'other'), '');
console.log('✓ edge cases (empty/null/undefined)');

// Psychology: 4–8 words, one line
const psychLong = rewriteHookForShorts('Your brain edits reality more than you realize and then you remember versions.', 'psychology');
assert(wordCountTotal(psychLong) <= HIGH_RETENTION_MAX_WORDS, `Psychology hook must be ≤${HIGH_RETENTION_MAX_WORDS} words, got ${wordCountTotal(psychLong)}: ${psychLong}`);
assert(!psychLong.includes('\n'), 'Psychology hook should be one line');
console.log('✓ Psychology: ≤8 words, one line');

// Psychology: strip "Did you know…" / "Ever wonder…" / "Why does…" / "In psychology…" etc.
const didYouKnowStripped = rewriteHookForShorts('Did you know your brain edits reality?', 'psychology');
assert(!/^\s*did you know\s/i.test(didYouKnowStripped), `Psychology must not start with "Did you know...": ${didYouKnowStripped}`);
const everWonderStripped = rewriteHookForShorts('Ever wonder why everyone follows the crowd?', 'psychology');
assert(!/^\s*ever wonder\s/i.test(everWonderStripped), `Psychology must not start with "Ever wonder...": ${everWonderStripped}`);
const inPsychStripped = rewriteHookForShorts('In psychology, this is called cognitive bias.', 'psychology');
assert(!/^\s*in psychology\s/i.test(inPsychStripped), `Psychology must not start with "In psychology...": ${inPsychStripped}`);
console.log('✓ Psychology: banned openers stripped');

// isHookCompliant: 4–8 words, observational not accusatory, no banned starts (psychology)
assert.strictEqual(isHookCompliant('Your brain hides this from you.', 'psychology').compliant, true); // 6 words
assert.strictEqual(isHookCompliant('Fairness isn\'t always what it seems.', 'psychology').compliant, true); // observational
assert.strictEqual(isHookCompliant('You spend to feel safe and secure every single day.', 'psychology').compliant, false); // >8 words
assert.strictEqual(isHookCompliant('You buy.', 'psychology').compliant, false); // <4 words
assert.strictEqual(isHookCompliant('You\'re lying to yourself.', 'psychology').compliant, false); // accusatory
assert.strictEqual(isHookCompliant('People often overspend.', 'psychology').compliant, false);
assert.strictEqual(isHookCompliant('Ever wonder why you buy?', 'psychology').compliant, false);
console.log('✓ isHookCompliant validation (4–8 words, observational, no accusatory, no banned starts)');

console.log('\nAll hook rewriter tests passed.');
process.exit(0);
