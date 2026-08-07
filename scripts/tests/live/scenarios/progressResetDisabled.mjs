// Verifies the learning-progress-reset RPC stays unreachable from a normal
// session — task brief sections 21 and 26 ("Do not grant execute on
// function public.reset_learning_language_progress(text) to authenticated
// ... The reset feature must remain disabled ... You may verify through
// live metadata that authenticated cannot execute it if useful, but do not
// activate it."). This test only ever calls the RPC as the ordinary
// `authenticated` role via the disposable user's own anon-key session —
// never as service_role, and never grants anything.
import { callRpc } from "../lib/liveHttp.mjs";
import { assertError } from "../lib/liveAssert.mjs";

export async function run(ctx, t) {
  t.section("Learning-progress reset stays disabled (reset_learning_language_progress)");

  await t.test("authenticated role cannot execute reset_learning_language_progress", async () => {
    const response = await callRpc(ctx.config, "reset_learning_language_progress", {
      p_target_language: ctx.targetLanguage,
    }, { accessToken: ctx.userA.session.accessToken });

    // Deliberately not asserting a specific status/error code: per
    // supabase/README.md's "Deployment safety" section for this RPC,
    // PostgREST typically reports a function the caller has no EXECUTE on
    // as 404 ("not found") rather than 403 — either is an acceptable
    // "blocked" outcome. Any 2xx response here would mean this destructive
    // primitive is reachable from a normal session and must be reported
    // immediately as a real production-schema mismatch, not treated as
    // this test needing a fix.
    assertError(response, "authenticated user calling reset_learning_language_progress");
  });
}
