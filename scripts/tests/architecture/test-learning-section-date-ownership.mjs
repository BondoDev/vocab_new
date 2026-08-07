// Architecture guard for "Frontend Cleanup: Share Current Learning Date":
// LearningSection.tsx must be the Learning dashboard's single frontend
// owner of getCurrentLearningDate() — it calls the RPC exactly once per
// mount and threads the result down to TodayProgressCard and
// DailyStreakCard as two props: todayISO (string | null) and
// todayISOStatus ("loading" | "ready" | "unavailable" | "error"). Neither
// card may call getCurrentLearningDate itself, and neither the date effect
// nor a daily-goal save may cause a second/duplicate date request.
//
// Before this cleanup, TodayProgressCard and DailyStreakCard each
// independently called getCurrentLearningDate() inside their own fetch
// effect, doubling the RPC call for a single Learning dashboard mount.
//
// A second, later defect (corrected by this version of the guard): the
// original todayISO/isTodayISOLoading two-prop contract collapsed a
// genuine RPC failure ("error") and a legitimate no-session state
// ("unavailable") into the exact same signal (todayISO: null,
// isTodayISOLoading: false), so both cards silently rendered their normal
// empty/zero fallback for an actual failed date request — a
// authoritative-looking "0 completed" / "no streak history" result that
// was never actually loaded. todayISOStatus exists specifically so the
// cards can tell the two apart: an "error" status blocks each card's own
// statistics request entirely and renders a neutral placeholder (the same
// one already used while loading) instead of a zero/empty "ready" result,
// while "unavailable" keeps the original, legitimate zero/empty fallback.
//
// Deliberately static/deterministic (Node stdlib only, no build, no
// network) so it stays cheap to run in CI and can't rot into a flaky check.
//
// Run: node scripts/tests/architecture/test-learning-section-date-ownership.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const LEARNING_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "learning");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function read(fileName) {
  return fs.readFileSync(path.join(LEARNING_DIR, fileName), "utf8");
}

// Strips `// ...` line-comment text (these files use only line comments,
// never block comments) so guards below check live code only — every
// component here also explains getCurrentLearningDate's *absence* in
// prose (e.g. "no longer calls getCurrentLearningDate() itself"), which
// would otherwise false-match a naive whole-file text search.
function stripLineComments(source) {
  // No `$` anchor: these files are CRLF (source checked out with
  // core.autocrlf), so each split("\n") element keeps a trailing "\r" that
  // "." (which excludes line terminators, \r included) can never reach —
  // anchoring on $ would then never match and silently strip nothing.
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*/, ""))
    .join("\n");
}

// Isolates a card's one fetch effect (body + dependency array) — both
// TodayProgressCard and DailyStreakCard declare exactly one useEffect.
function extractFetchEffect(liveSource, label) {
  const match = liveSource.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\);/);
  assert.ok(match, `${label}'s fetch effect must exist`);
  return { body: match[1], deps: match[2] };
}

console.log("\n=== Learning dashboard current-date ownership guards ===\n");

const learningSection = read("LearningSection.tsx");
const todayProgressCard = read("TodayProgressCard.tsx");
const dailyStreakCard = read("DailyStreakCard.tsx");
const learningSectionLive = stripLineComments(learningSection);
const todayProgressCardLive = stripLineComments(todayProgressCard);
const dailyStreakCardLive = stripLineComments(dailyStreakCard);

test("1. LearningSection imports and calls getCurrentLearningDate exactly once (live code, not prose)", () => {
  assert.match(
    learningSectionLive,
    /import\s*\{\s*getCurrentLearningDate\s*\}\s*from\s*"..\/..\/..\/..\/lib\/learningDate"/,
    "LearningSection must import getCurrentLearningDate from src/lib/learningDate.ts",
  );
  const callCount = (learningSectionLive.match(/getCurrentLearningDate\(/g) || []).length;
  // 1 import specifier occurrence is excluded by the pattern below (it has
  // no trailing "(" as an import binding) — this only counts call-like
  // `getCurrentLearningDate(` occurrences, e.g. the real `await
  // getCurrentLearningDate(session)` plus describeSupabaseError's
  // diagnostic label argument `"getCurrentLearningDate"` (a string, no
  // trailing paren, so also excluded). Expect exactly one real call site.
  assert.equal(callCount, 1, `expected exactly one live getCurrentLearningDate( call site, found ${callCount}`);
});

test("2. TodayProgressCard no longer imports or calls getCurrentLearningDate (live code, not prose)", () => {
  assert.doesNotMatch(todayProgressCardLive, /getCurrentLearningDate/, "TodayProgressCard must not reference getCurrentLearningDate in live code");
  assert.doesNotMatch(todayProgressCardLive, /from\s*"..\/..\/..\/..\/lib\/learningDate"/, "TodayProgressCard must not import from lib/learningDate");
});

test("3. DailyStreakCard no longer imports or calls getCurrentLearningDate (live code, not prose)", () => {
  assert.doesNotMatch(dailyStreakCardLive, /getCurrentLearningDate/, "DailyStreakCard must not reference getCurrentLearningDate in live code");
  assert.doesNotMatch(dailyStreakCardLive, /from\s*"..\/..\/..\/..\/lib\/learningDate"/, "DailyStreakCard must not import from lib/learningDate");
});

test('4. Both cards declare a typed todayISO/todayISOStatus prop pair distinguishing all four states', () => {
  const statusUnion = '"loading" | "ready" | "unavailable" | "error"';
  for (const [label, source] of [
    ["TodayProgressCard", todayProgressCard],
    ["DailyStreakCard", dailyStreakCard],
  ]) {
    assert.match(
      source,
      new RegExp(`interface ${label}Props\\s*\\{[^}]*todayISO: string \\| null;[^}]*todayISOStatus: ${statusUnion.replace(/[|]/g, "\\$&")};[^}]*\\}`, "s"),
      `${label}Props must declare todayISO: string | null and todayISOStatus: ${statusUnion}`,
    );
    // The old collapsed boolean contract must be fully gone, not just
    // supplemented — this is the exact prop this cleanup replaces.
    assert.doesNotMatch(source, /isTodayISOLoading/, `${label} must no longer reference isTodayISOLoading anywhere`);
  }
});

test("5. LearningSection passes todayISO and todayISOStatus (not a collapsed boolean) down to both cards", () => {
  const dailyStreakCardJsxMatch = learningSection.match(/<DailyStreakCard\s+([\s\S]*?)\/>/);
  const todayProgressCardJsxMatch = learningSection.match(/<TodayProgressCard\s+([\s\S]*?)\/>/);
  assert.ok(dailyStreakCardJsxMatch, "LearningSection must render <DailyStreakCard ... />");
  assert.ok(todayProgressCardJsxMatch, "LearningSection must render <TodayProgressCard ... />");
  for (const [label, jsx] of [
    ["DailyStreakCard", dailyStreakCardJsxMatch[1]],
    ["TodayProgressCard", todayProgressCardJsxMatch[1]],
  ]) {
    assert.match(jsx, /todayISO=\{todayISO\}/, `${label} must receive todayISO={todayISO}`);
    assert.match(jsx, /todayISOStatus=\{todayISOStatus\}/, `${label} must receive todayISOStatus={todayISOStatus}`);
  }
  assert.doesNotMatch(learningSectionLive, /isTodayISOLoading/, "LearningSection must no longer reference isTodayISOLoading anywhere");
});

test("6. Each card's own fetch effect gates on todayISO/todayISOStatus before performing its own read", () => {
  for (const [label, source, liveSource] of [
    ["TodayProgressCard", todayProgressCard, todayProgressCardLive],
    ["DailyStreakCard", dailyStreakCard, dailyStreakCardLive],
  ]) {
    const { deps } = extractFetchEffect(liveSource, label);
    assert.match(deps, /\btodayISO\b/, `${label}'s fetch effect must depend on todayISO`);
    assert.match(deps, /\btodayISOStatus\b/, `${label}'s fetch effect must depend on todayISOStatus`);
    assert.match(source, /!todayISO/, `${label} must guard its own read on todayISO being present`);
  }
});

test('7. Date "loading" prevents both cards from performing their own statistics request', () => {
  for (const [label, liveSource] of [
    ["TodayProgressCard", todayProgressCardLive],
    ["DailyStreakCard", dailyStreakCardLive],
  ]) {
    const { body } = extractFetchEffect(liveSource, label);
    // The loading branch (which also covers isProfileLoaded) must appear,
    // set the card's own state to "loading", and return before the async
    // fetch IIFE lower in the same effect body.
    const loadingBranch = body.match(
      /if\s*\(!isProfileLoaded \|\| todayISOStatus === "loading"\)\s*\{([\s\S]*?return;)\s*\}/,
    );
    assert.ok(loadingBranch, `${label} must have an explicit todayISOStatus === "loading" guard`);
    assert.match(loadingBranch[1], /setState\(\{ status: "loading" \}\)/, `${label}'s loading guard must set its own state to loading`);
    assert.match(loadingBranch[1], /return;/, `${label}'s loading guard must return before reaching its own fetch`);
    const loadingGuardIndex = body.indexOf(loadingBranch[0]);
    const fetchIndex = body.indexOf("void (async () => {");
    assert.ok(fetchIndex > loadingGuardIndex, `${label}'s loading guard must appear before its own fetch IIFE`);
  }
});

test('8. Date "error" prevents both cards from performing their own statistics request', () => {
  for (const [label, liveSource] of [
    ["TodayProgressCard", todayProgressCardLive],
    ["DailyStreakCard", dailyStreakCardLive],
  ]) {
    const { body } = extractFetchEffect(liveSource, label);
    const errorBranch = body.match(/if\s*\(todayISOStatus === "error"\)\s*\{([\s\S]*?return;)\s*\}/);
    assert.ok(errorBranch, `${label} must have an explicit todayISOStatus === "error" guard, distinct from the "loading"/"unavailable" paths`);
    assert.match(errorBranch[1], /return;/, `${label}'s error guard must return before reaching its own fetch`);
    const errorGuardIndex = body.indexOf(errorBranch[0]);
    const fetchIndex = body.indexOf("void (async () => {");
    assert.ok(fetchIndex > errorGuardIndex, `${label}'s error guard must appear before its own fetch IIFE — a date error must never trigger this card's statistics request`);
  }
});

test('9. Date "error" never resolves to a successful ready zero/empty presentation — it is a distinct, non-"ready" state', () => {
  for (const [label, liveSource] of [
    ["TodayProgressCard", todayProgressCardLive],
    ["DailyStreakCard", dailyStreakCardLive],
  ]) {
    const { body } = extractFetchEffect(liveSource, label);
    const errorBranch = body.match(/if\s*\(todayISOStatus === "error"\)\s*\{([\s\S]*?return;)\s*\}/);
    assert.ok(errorBranch, `${label} must have a todayISOStatus === "error" guard`);
    // The error branch's own setState call must never be status: "ready" —
    // that would be exactly the false-positive-zero bug this guard exists
    // to catch (a failed date fetch presented as successfully-loaded data).
    assert.doesNotMatch(
      errorBranch[1],
      /setState\(\{\s*status:\s*"ready"/,
      `${label}'s todayISOStatus === "error" branch must not set a "ready" state — a date error is not equivalent to a successfully-loaded zero/empty result`,
    );
    assert.match(
      errorBranch[1],
      /setState\(\{\s*status:\s*"blocked"\s*\}\)/,
      `${label}'s todayISOStatus === "error" branch must set a distinct non-ready "blocked" state`,
    );
  }
  // The card-level LoadState union itself must declare "blocked" as a
  // status distinct from "ready" — not, say, a "ready" variant with a
  // sentinel/null payload that would still satisfy a loose `status ===
  // "ready"` check elsewhere in the component.
  assert.match(todayProgressCard, /type LoadState = \{ status: "loading" \} \| \{ status: "ready"; completed: number \} \| \{ status: "blocked" \};/);
  assert.match(dailyStreakCard, /\{ status: "blocked" \}/);
});

test("10. Only LearningSection renders the date error/retry UI — neither card duplicates it", () => {
  assert.match(learningSection, /userProfile\.learningSection\.dateLoadError/, "LearningSection must render the shared date-error copy");
  assert.match(learningSection, /userProfile\.learningSection\.dateRetryButton/, "LearningSection must render the shared retry-button copy");
  for (const [label, source] of [
    ["TodayProgressCard", todayProgressCard],
    ["DailyStreakCard", dailyStreakCard],
  ]) {
    assert.doesNotMatch(source, /dateLoadError/, `${label} must not render its own copy of the date-error message`);
    assert.doesNotMatch(source, /dateRetryButton/, `${label} must not render its own copy of the retry button`);
    assert.doesNotMatch(source, /handleRetryDateLoad|setDateRetryToken/, `${label} must not own any part of the date-retry action`);
  }
});

test('11. Date "ready" is the only status under which each card\'s own request runs, and each request appears exactly once', () => {
  const todayReadCount = (todayProgressCardLive.match(/readTodayNewWordsCompleted\(/g) || []).length;
  assert.equal(todayReadCount, 1, `expected exactly one readTodayNewWordsCompleted( call site, found ${todayReadCount}`);
  const streakReadCount = (dailyStreakCardLive.match(/readDailyStreakStats\(/g) || []).length;
  assert.equal(streakReadCount, 1, `expected exactly one readDailyStreakStats( call site, found ${streakReadCount}`);

  for (const [label, liveSource, readCallName] of [
    ["TodayProgressCard", todayProgressCardLive, "readTodayNewWordsCompleted("],
    ["DailyStreakCard", dailyStreakCardLive, "readDailyStreakStats("],
  ]) {
    const { body } = extractFetchEffect(liveSource, label);
    const loadingGuardIndex = body.indexOf('todayISOStatus === "loading"');
    const errorGuardIndex = body.indexOf('todayISOStatus === "error"');
    const readIndex = body.indexOf(readCallName);
    assert.ok(loadingGuardIndex >= 0 && errorGuardIndex >= 0 && readIndex >= 0, `${label} must have both guards and its own read call in the same effect`);
    assert.ok(readIndex > loadingGuardIndex && readIndex > errorGuardIndex, `${label}'s own request must be reachable only after both the "loading" and "error" guards`);
  }
});

test('12. Date "unavailable" remains distinguishable from "error" — both at the type level and in each card\'s branching', () => {
  assert.match(
    learningSectionLive,
    /type LearningDateState =\s*\|\s*\{\s*status:\s*"loading"\s*\}\s*\|\s*\{\s*status:\s*"ready";\s*todayISO:\s*string\s*\}\s*\|\s*\{\s*status:\s*"unavailable"\s*\}\s*\|\s*\{\s*status:\s*"error"\s*\}/,
    "LearningDateState must declare loading/ready/unavailable/error as four distinct variants",
  );
  for (const [label, liveSource] of [
    ["TodayProgressCard", todayProgressCardLive],
    ["DailyStreakCard", dailyStreakCardLive],
  ]) {
    const { body } = extractFetchEffect(liveSource, label);
    // "unavailable" must never be folded into the same explicit branch as
    // "error" (e.g. `todayISOStatus === "error" || todayISOStatus ===
    // "unavailable"`) — it must fall through to the pre-existing generic
    // !todayISO fallback instead, which still resolves to "ready" (the
    // original, legitimate signed-out/no-session behavior).
    assert.doesNotMatch(
      body,
      /todayISOStatus === "unavailable"/,
      `${label} must not special-case "unavailable" explicitly — it relies on the existing !todayISO fallback, unlike "error" which is intercepted before that fallback`,
    );
    assert.doesNotMatch(
      body,
      /todayISOStatus === "error" \|\| todayISOStatus === "unavailable"|todayISOStatus === "unavailable" \|\| todayISOStatus === "error"/,
      `${label} must not combine "error" and "unavailable" into one branch — they resolve to different card-level states ("blocked" vs "ready, empty")`,
    );
  }
});

test("13. LearningSection's date-loading effect is scoped to auth/profile readiness and its own retry token only — never practiceLanguage or streakRefreshToken", () => {
  // Isolates the specific effect that calls getCurrentLearningDate (rather
  // than matching the first useEffect in the file, which — unlike the
  // single-effect card components — is no longer a safe assumption here
  // now that LearningSection could grow more than one effect over time).
  const dateEffectMatch = learningSection.match(
    /useEffect\(\(\) => \{(?:(?!useEffect)[\s\S])*?getCurrentLearningDate[\s\S]*?\}, \[([^\]]*)\]\);/,
  );
  assert.ok(dateEffectMatch, "LearningSection's date-loading effect must exist and call getCurrentLearningDate within its own body");
  const deps = dateEffectMatch[1];
  assert.match(deps, /\bauthUserId\b/, "the date effect must depend on authUserId (refetch on account change)");
  assert.match(deps, /\bisProfileLoaded\b/, "the date effect must depend on isProfileLoaded (wait for profile readiness)");
  assert.match(deps, /\bdateRetryToken\b/, "the date effect must depend on its own retry token");
  assert.doesNotMatch(
    deps,
    /\bpracticeLanguage\b/,
    "the date effect must not depend on practiceLanguage — the authoritative date does not depend on the target language",
  );
  assert.doesNotMatch(
    deps,
    /\bstreakRefreshToken\b/,
    "the date effect must not depend on streakRefreshToken — a daily-goal save must never refetch the current learning date",
  );
});

test('14. A shared-date retry action exists, is wired to a real control, is distinct from streakRefreshToken, and triggers exactly one new date request', () => {
  assert.match(learningSection, /const \[dateRetryToken, setDateRetryToken\] = useState\(0\);/);
  assert.match(learningSection, /setDateRetryToken\(\(token\) => token \+ 1\)/);
  assert.match(learningSection, /onClick=\{handleRetryDateLoad\}/, "the retry control must be wired to a click handler");
  // handleRetryDateLoad must bump only dateRetryToken, never
  // streakRefreshToken — a retry of the failed date must not also force an
  // unrelated stats refetch as a side effect.
  const handlerMatch = learningSectionLive.match(/const handleRetryDateLoad = \(\) => ([^;]+);/);
  assert.ok(handlerMatch, "handleRetryDateLoad must exist");
  assert.doesNotMatch(handlerMatch[1], /streakRefreshToken|setStreakRefreshToken/, "the retry handler must not touch streakRefreshToken");
  // getCurrentLearningDate itself is called exactly once in live source
  // (test 1) inside an effect whose only re-run triggers are
  // authUserId/isProfileLoaded/dateRetryToken (test 13) — together these
  // prove one Retry click produces exactly one new call, not a burst.
});

test("15. LearningSection's README documents the single-owner date contract and the error-vs-unavailable distinction", () => {
  const readme = fs.readFileSync(path.join(LEARNING_DIR, "README.md"), "utf8");
  assert.match(readme, /LearningSection\.tsx.{0,80}single\s+frontend\s+owner/s);
  assert.match(readme, /todayISOStatus/, "the README must document the todayISOStatus contract, not just todayISO");
  assert.match(readme, /"blocked"/, "the README must document each card's blocked state on a date error");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("learning-section-date-ownership guard passed");
}
