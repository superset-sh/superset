const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

function readBooleanEnv(name: string): boolean {
	const value = process.env[name];
	if (!value) return false;
	return TRUE_ENV_VALUES.has(value.toLowerCase());
}

export const IS_DESKTOP_TEST_MODE = readBooleanEnv("DESKTOP_TEST_MODE");

export const DESKTOP_E2E_ARTIFACTS_DIR =
	process.env.DESKTOP_E2E_ARTIFACTS_DIR ?? null;

export const DEFAULT_DESKTOP_TEST_WINDOW_BOUNDS = {
	width: 1440,
	height: 960,
} as const;
