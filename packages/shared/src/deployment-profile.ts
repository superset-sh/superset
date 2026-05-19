/**
 * Deployment profile resolution.
 *
 * Strict profiles (`cloud`, `internal`) validate all required integration
 * env vars at boot. Lenient profiles (`local`, `ci`) let the app boot with
 * missing integration keys; call sites lazy-throw or no-op when the missing
 * feature is exercised.
 *
 * `SUPERSET_PROFILE=local` is the explicit contributor opt-in for a fresh
 * clone backed by local Postgres/Electric and no third-party credentials.
 */
export type DeploymentProfile = "cloud" | "local" | "ci" | "internal";

const VALID_PROFILES: DeploymentProfile[] = [
	"cloud",
	"local",
	"ci",
	"internal",
];

function isTruthyFlag(value: string | undefined): boolean {
	return value === "1" || value === "true";
}

function getExplicitProfile(
	envSource: Record<string, string | undefined>,
): DeploymentProfile | undefined {
	const explicitProfile = envSource.SUPERSET_PROFILE;
	if (!explicitProfile) return undefined;
	if (VALID_PROFILES.includes(explicitProfile as DeploymentProfile)) {
		return explicitProfile as DeploymentProfile;
	}
	throw new Error(
		`Invalid SUPERSET_PROFILE="${explicitProfile}". Expected one of: ${VALID_PROFILES.join(
			", ",
		)}.`,
	);
}

export function getDeploymentProfile(
	envSource: Record<string, string | undefined> = process.env,
): DeploymentProfile {
	if (isTruthyFlag(envSource.VERCEL) || envSource.VERCEL_ENV) return "cloud";
	const explicitProfile = getExplicitProfile(envSource);
	if (explicitProfile) return explicitProfile;
	if (isTruthyFlag(envSource.CI)) return "ci";
	return "internal";
}

export function isStrictProfile(
	profile: DeploymentProfile = getDeploymentProfile(),
): boolean {
	return profile === "cloud" || profile === "internal";
}

export function isLocalProfile(
	profile: DeploymentProfile = getDeploymentProfile(),
): boolean {
	return profile === "local";
}

export function shouldSkipEnvValidation(
	envSource: Record<string, string | undefined> = process.env,
): boolean {
	return (
		!isStrictProfile(getDeploymentProfile(envSource)) ||
		isTruthyFlag(envSource.SKIP_ENV_VALIDATION)
	);
}
