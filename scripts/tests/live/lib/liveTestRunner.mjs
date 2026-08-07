// Tiny pass/fail reporter shared by every scenario module — matches the
// existing scripts/tests/**/*.mjs convention (a local `test(name, fn)`
// helper with a running passed/failed count) closely enough to feel
// familiar, extended with `section()` for this suite's larger scenario
// files and async-aware `test()` since every check here makes a real
// network call.
export class LiveTestReporter {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
  }

  section(title) {
    console.log(`\n=== ${title} ===`);
  }

  async test(name, fn) {
    try {
      await fn();
      this.passed++;
      console.log(`  PASS  ${name}`);
    } catch (error) {
      this.failed++;
      const message = error instanceof Error ? error.message : String(error);
      this.failures.push({ name, message });
      console.error(`  FAIL  ${name}`);
      console.error(`        ${message}`);
    }
  }

  // For a failure outside any single test() call (e.g. disposable-user
  // setup itself throwing) — still counted, still fails the run's exit
  // code, without pretending it was a named assertion.
  fatal(label, error) {
    this.failed++;
    const message = error instanceof Error ? error.message : String(error);
    this.failures.push({ name: label, message });
    console.error(`  FATAL ${label}`);
    console.error(`        ${message}`);
  }

  summary() {
    console.log(`\n${this.passed} passed, ${this.failed} failed.`);
    return this.failed === 0;
  }
}
