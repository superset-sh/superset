// Validates ~/.superset/config.json's contents directly — herdr's `config
// check` equivalent. `settings get/set` (a separate, desktop-app-settings
// SQLite store) already validates at write time, so hand-editing can't
// corrupt it; this file, by contrast, is plain JSON a user can and does
// hand-edit (or a bad merge/restore can truncate), with nothing today that
// catches a typo before it surfaces as a confusing runtime auth failure.

export interface ConfigCheckIssue {
	severity: "error" | "warning";
	message: string;
}

export interface ConfigCheckResult {
	path: string;
	exists: boolean;
	valid: boolean;
	loggedIn: boolean;
	issues: ConfigCheckIssue[];
}

const KNOWN_TOP_LEVEL_KEYS = new Set(["auth", "apiKey", "organizationId"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `raw` is the file's contents, or `undefined` when it doesn't exist (a
 * fresh install, never logged in — not itself an error). `now` is injectable
 * for deterministic expiry tests.
 */
export function checkConfig(
	raw: string | undefined,
	path: string,
	now: number = Date.now(),
): ConfigCheckResult {
	if (raw === undefined) {
		return { path, exists: false, valid: true, loggedIn: false, issues: [] };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return {
			path,
			exists: true,
			valid: false,
			loggedIn: false,
			issues: [
				{
					severity: "error",
					message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
				},
			],
		};
	}

	const issues: ConfigCheckIssue[] = [];
	if (!isPlainObject(parsed)) {
		issues.push({
			severity: "error",
			message: "Top-level value must be a JSON object",
		});
		return { path, exists: true, valid: false, loggedIn: false, issues };
	}

	let hasValidAuth = false;
	if (parsed.auth !== undefined) {
		if (!isPlainObject(parsed.auth)) {
			issues.push({ severity: "error", message: "`auth` must be an object" });
		} else {
			const auth = parsed.auth;
			if (
				typeof auth.accessToken !== "string" ||
				auth.accessToken.length === 0
			) {
				issues.push({
					severity: "error",
					message: "`auth.accessToken` must be a non-empty string",
				});
			} else {
				hasValidAuth = true;
			}
			if (
				auth.refreshToken !== undefined &&
				typeof auth.refreshToken !== "string"
			) {
				issues.push({
					severity: "error",
					message: "`auth.refreshToken` must be a string",
				});
			}
			if (typeof auth.expiresAt !== "number") {
				issues.push({
					severity: "error",
					message: "`auth.expiresAt` must be a number (ms epoch)",
				});
			} else if (auth.expiresAt < now) {
				issues.push({
					severity: "warning",
					message:
						"`auth.expiresAt` is in the past — the access token is expired (refreshes automatically if a refresh token is present)",
				});
			}
		}
	}

	let hasApiKey = false;
	if (parsed.apiKey !== undefined) {
		if (typeof parsed.apiKey !== "string" || parsed.apiKey.length === 0) {
			issues.push({
				severity: "error",
				message: "`apiKey` must be a non-empty string",
			});
		} else {
			hasApiKey = true;
			if (!parsed.apiKey.startsWith("sk_")) {
				issues.push({
					severity: "warning",
					message:
						"`apiKey` doesn't look like a Superset API key (expected an sk_... prefix)",
				});
			}
		}
	}

	if (parsed.organizationId !== undefined) {
		if (
			typeof parsed.organizationId !== "string" ||
			parsed.organizationId.length === 0
		) {
			issues.push({
				severity: "error",
				message: "`organizationId` must be a non-empty string",
			});
		}
	}

	for (const key of Object.keys(parsed)) {
		if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
			issues.push({
				severity: "warning",
				message: `Unknown key "${key}" — not read by any current Superset CLI version`,
			});
		}
	}

	const loggedIn = hasValidAuth || hasApiKey;
	if (!loggedIn) {
		issues.push({
			severity: "warning",
			message:
				"No `auth` or `apiKey` present — not logged in (run: superset auth login)",
		});
	}

	const valid = !issues.some((issue) => issue.severity === "error");
	return { path, exists: true, valid, loggedIn, issues };
}
