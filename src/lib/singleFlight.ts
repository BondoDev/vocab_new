// Generic single-flight coordinator. Wraps an async "start" operation so
// that, while a previous call is still pending, later callers join that
// same in-flight Promise instead of triggering a second one - `start` is
// only ever invoked for the call that actually begins a new attempt.
//
// Deliberately has zero knowledge of what the wrapped operation does.
// src/lib/supabaseAuth.ts's refreshSupabaseSession is the only place that
// gives this Supabase/session meaning (D-2: single-flight refresh) - that
// is what keeps refresh ownership centralized there; this module is just
// the generic plumbing, reused as-is with no refresh-specific logic here.
//
// It's also why this file - unlike supabaseAuth.ts, which reads
// import.meta.env at module load and can't be imported under plain Node -
// can be imported and genuinely exercised at runtime. See
// scripts/tests/architecture/test-refresh-single-flight.mjs.
export function createSingleFlight<T>() {
  let inFlight: Promise<T> | null = null;

  function run(start: () => Promise<T>): Promise<T> {
    if (inFlight) {
      // Already running: join the existing attempt. `start` is
      // intentionally never invoked here - only the branch below, for
      // whichever call actually begins a new attempt, calls it.
      return inFlight;
    }

    const attempt = start().finally(() => {
      // Guards against clearing a *different*, newer attempt's slot. By
      // construction nothing can begin a new attempt while `inFlight`
      // still holds this one (the `if (inFlight)` check above prevents
      // it), so this is always true today - a defensive check against a
      // future change to this function, not a race this code can hit now.
      //
      // Chaining .finally() directly onto the stored promise (rather than
      // clearing `inFlight` from some external callback) is what makes
      // this safe against the "caller arrives right as the in-flight
      // Promise settles" race: .finally()'s callback is guaranteed to run
      // to completion *before* `attempt` itself transitions to settled,
      // so no caller awaiting `attempt` can ever observe it resolve/reject
      // while `inFlight` still points at it. A later, genuinely new call
      // to run() therefore always sees `inFlight === null` and starts a
      // fresh attempt - it can never reuse a completed one.
      if (inFlight === attempt) {
        inFlight = null;
      }
    });
    inFlight = attempt;
    return attempt;
  }

  return { run };
}
