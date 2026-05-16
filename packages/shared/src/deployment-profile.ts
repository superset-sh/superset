/**
 * Deployment profile resolution.
 *
 * Three profiles, ranked by discriminator trust:
 *
 *   1. `cloud`     — Vercel sets `VERCEL=1` automatically. Contributors
 *                    can't fake it locally. Strict-validated.
 *   2. `oss-dev`   — Contributor explicitly sets `SUPERSET_OSS=1` to opt
 *                    into the lenient profile so a fresh clone boots
 *                    without every integration key.
 *   3. `internal`  — Default. Covers internal team dev workspaces and
 *                    self-hosted production. Strict-validated — matches
 *                    today's fail-fast behavior so internal devs and
 *                    self-hosters get loud errors on missing keys.
 *
 * **Strict profiles** (`cloud`, `internal`) hard-fail at boot when an
 * integration key is missing.
 *
 * **Lenient profile** (`oss-dev`) allows the app to boot with missing
 * keys; call sites lazy-throw / no-op so features degrade visibly
 * rather than crashing module load.
 *
 * Default-strict is the conservative direction: an internal dev or
 * self-hoster who forgets to source their `.env` gets a clear failure,
 * not a silently-degraded app. OSS contributors trade a one-time
 * `SUPERSET_OSS=1` for that safety guarantee.
 */
export type DeploymentProfile = "cloud" | "oss-dev" | "internal";

export function getDeploymentProfile(
	envSource: Record<string, string | undefined> = process.env,
): DeploymentProfile {
	if (envSource.VERCEL === "1") return "cloud";
	if (envSource.SUPERSET_OSS === "1") return "oss-dev";
	return "internal";
}

export function isStrictProfile(profile: DeploymentProfile): boolean {
	return profile !== "oss-dev";
}
