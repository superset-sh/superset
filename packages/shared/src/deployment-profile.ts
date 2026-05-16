/**
 * Deployment profile resolution.
 *
 * Four profiles, ranked by discriminator trust:
 *
 *   1. `cloud`     — Vercel sets `VERCEL=1` automatically at RUNTIME on
 *                    its serverless functions. Contributors can't fake
 *                    it locally. Strict — every integration key required.
 *   2. `oss-dev`   — Contributor explicitly sets `SUPERSET_OSS=1` to
 *                    opt into the lenient profile so a fresh clone
 *                    boots without every integration key.
 *   3. `ci`        — GitHub Actions sets `CI=true` (and runners do too).
 *                    Lenient by design: lint/typecheck/test jobs don't
 *                    have integration keys, and any actual deploy step
 *                    runs `vercel build` which pulls env from the
 *                    Vercel project. Runtime strictness still kicks in
 *                    once the build is deployed and `VERCEL=1` is set.
 *   4. `internal`  — Default. Covers internal team dev workspaces and
 *                    self-hosted production. Strict — matches today's
 *                    fail-fast behavior so internal devs and
 *                    self-hosters get loud errors on missing keys.
 *
 * **Strict** (`cloud`, `internal`) hard-fail at boot when an integration
 * key is missing.
 *
 * **Lenient** (`oss-dev`, `ci`) allow the app to boot with missing keys;
 * call sites lazy-throw / no-op so features degrade visibly rather than
 * crashing module load.
 *
 * Default-strict at runtime is the conservative direction: an internal
 * dev or self-hoster who forgets to source their `.env` gets a clear
 * failure, not a silently-degraded app. OSS contributors trade a one-time
 * `SUPERSET_OSS=1` for that safety guarantee. CI build steps degrade so
 * lint/typecheck/test don't require every production secret.
 */
export type DeploymentProfile = "cloud" | "oss-dev" | "ci" | "internal";

export function getDeploymentProfile(
	envSource: Record<string, string | undefined> = process.env,
): DeploymentProfile {
	if (envSource.VERCEL === "1") return "cloud";
	if (envSource.SUPERSET_OSS === "1") return "oss-dev";
	if (envSource.CI === "true") return "ci";
	return "internal";
}

export function isStrictProfile(profile: DeploymentProfile): boolean {
	return profile !== "oss-dev" && profile !== "ci";
}
