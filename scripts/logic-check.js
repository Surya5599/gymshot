/**
 * Pure-logic checks for streak and day-key math - the two places where an
 * off-by-one silently corrupts someone's streak.
 *
 * Run with `npm run test:logic`, which compiles src/lib/date.ts and
 * src/lib/streak.ts to a temp dir first (they import nothing from React
 * Native, so plain node can exercise them).
 */
const path = require('path');
const OUT = process.env.PODSHOT_LOGIC_OUT || path.join(__dirname, '..', '.logic-build');

const { computeStreak } = require(path.join(OUT, 'streak.js'));
const { toDayKey, addDays, formatDay, daysBetween } = require(path.join(OUT, 'date.js'));
const today = toDayKey();
const d = (n) => addDays(today, n);
let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); }
  else console.log('ok  ', name);
};

check('empty', computeStreak([]).current, 0);
check('today only', computeStreak([d(0)]).current, 1);
check('3 consecutive incl today', computeStreak([d(0), d(-1), d(-2)]).current, 3);
// Today still open: yesterday-anchored run must survive.
check('grace: run ends yesterday', computeStreak([d(-1), d(-2)]).current, 2);
// A fully-missed day breaks it.
check('missed day resets', computeStreak([d(-2), d(-3)]).current, 0);
check('best survives reset', computeStreak([d(-2), d(-3), d(-4)]).best, 3);
check('loggedToday false', computeStreak([d(-1)]).loggedToday, false);
check('loggedToday true', computeStreak([d(0)]).loggedToday, true);
check('gap does not merge', computeStreak([d(0), d(-1), d(-3), d(-4)]).current, 2);
check('best picks longest run', computeStreak([d(0), d(-1), d(-3), d(-4), d(-5)]).best, 3);

check('daysBetween 0', daysBetween(today, today), 0);
check('daysBetween 5', daysBetween(d(-5), today), 5);
check('formatDay today', formatDay(today), 'Today');
check('formatDay yesterday', formatDay(d(-1)), 'Yesterday');
check('dayKey shape', /^\d{4}-\d{2}-\d{2}$/.test(today), true);
// Month rollover: adding days must not produce an invalid key.
check('rollover valid', /^\d{4}-\d{2}-\d{2}$/.test(addDays('2026-01-31', 1)), true);
check('rollover value', addDays('2026-01-31', 1), '2026-02-01');
check('leap year', addDays('2028-02-28', 1), '2028-02-29');

const m = computeStreak([d(0)]);
check('monthProgress in range', m.monthProgress > 0 && m.monthProgress <= 1, true);
console.log(fails ? `\n${fails} FAILURES` : '\nall logic checks passed');
process.exit(fails ? 1 : 0);
