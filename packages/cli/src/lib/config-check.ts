import { readFileSync } from "node:fs";
import { AUTH_REFRESH_LEEWAY_MS, type SupersetConfig } from "./config";

// `settings get/set` validates at write time; config.json is plain JSON a
// person can hand-edit or a restore can truncate, so it is checked on read.

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

interface FieldCheck {
	issues: ConfigCheckIssue[];
	/** Whether the field, as written, logs the CLI in. */
	credential: boolean;
}

const error = (message: string): ConfigCheckIssue => ({
	severity: "error",
	message,
});
const warning = (message: string): ConfigCheckIssue => ({
	severity: "warning",
	message,
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

// Exhaustive over the auth block for the same reason as CHECKS below.
const AUTH_KEYS: { [K in keyof NonNullable<SupersetConfig["auth"]>]-?: true } =
	{ accessToken: true, refreshToken: true, expiresAt: true };

function checkAuth(value: unknown, now: number): FieldCheck {
	if (!isPlainObject(value)) {
		return { issues: [error("`auth` must be an object")], credential: false };
	}
	const issues: ConfigCheckIssue[] = [];
	const hasToken = isNonEmptyString(value.accessToken);
	if (!hasToken) {
		issues.push(error("`auth.accessToken` must be a non-empty string"));
	}
	const hasRefresh = isNonEmptyString(value.refreshToken);
	if (value.refreshToken !== undefined && !hasRefresh) {
		issues.push(error("`auth.refreshToken` must be a non-empty string"));
	}
	for (const key of Object.keys(value)) {
		if (!Object.hasOwn(AUTH_KEYS, key)) {
			issues.push(
				warning(`Unknown key "auth.${key}" (this CLI version ignores it)`),
			);
		}
	}
	let usable = true;
	if (
		typeof value.expiresAt !== "number" ||
		!Number.isFinite(value.expiresAt)
	) {
		issues.push(
			error("`auth.expiresAt` must be a finite number (ms since the epoch)"),
		);
	} else if (value.expiresAt - AUTH_REFRESH_LEEWAY_MS < now) {
		const when =
			value.expiresAt < now
				? "is in the past"
				: `is less than ${Math.round(AUTH_REFRESH_LEEWAY_MS / 60_000)} minutes away`;
		if (hasRefresh) {
			issues.push(
				warning(
					`\`auth.expiresAt\` ${when}: the next command refreshes the token`,
				),
			);
		} else {
			usable = false;
			issues.push(
				warning(
					`\`auth.expiresAt\` ${when} and there is no refresh token: the next command fails with "Session expired" (run: superset auth login)`,
				),
			);
		}
	}
	return { issues, credential: hasToken && usable };
}

function checkApiKey(value: unknown): FieldCheck {
	if (!isNonEmptyString(value)) {
		return {
			issues: [error("`apiKey` must be a non-empty string")],
			credential: false,
		};
	}
	return {
		issues: value.startsWith("sk_")
			? []
			: [
					warning(
						"`apiKey` does not look like a Superset API key (expected an sk_ prefix)",
					),
				],
		credential: true,
	};
}

function checkOrganizationId(value: unknown): FieldCheck {
	return {
		issues: isNonEmptyString(value)
			? []
			: [error("`organizationId` must be a non-empty string")],
		credential: false,
	};
}

// Exhaustive over SupersetConfig: a field added to the type does not compile
// here until it has a check, and a check for a removed field is an excess key.
const CHECKS: {
	[K in keyof SupersetConfig]-?: (value: unknown, now: number) => FieldCheck;
} = {
	auth: checkAuth,
	apiKey: checkApiKey,
	organizationId: checkOrganizationId,
};

function isKnownKey(key: string): key is keyof SupersetConfig {
	return Object.hasOwn(CHECKS, key);
}

/** `raw` is the file's text, or undefined when there is no file. */
export function checkConfig(
	raw: string | undefined,
	path: string,
	now: number = Date.now(),
): ConfigCheckResult {
	if (raw === undefined) {
		return { path, exists: false, valid: true, loggedIn: false, issues: [] };
	}
	const invalid = (issue: ConfigCheckIssue): ConfigCheckResult => ({
		path,
		exists: true,
		valid: false,
		loggedIn: false,
		issues: [issue],
	});

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (cause) {
		const detail = cause instanceof Error ? cause.message : String(cause);
		return invalid(error(`Invalid JSON: ${detail}`));
	}
	if (!isPlainObject(parsed)) {
		return invalid(error("Top-level value must be a JSON object"));
	}

	const issues: ConfigCheckIssue[] = [];
	let loggedIn = false;
	for (const [key, value] of Object.entries(parsed)) {
		if (!isKnownKey(key)) {
			issues.push(
				warning(`Unknown key "${key}" (this CLI version ignores it)`),
			);
			continue;
		}
		const field = CHECKS[key](value, now);
		issues.push(...field.issues);
		loggedIn ||= field.credential;
	}
	if (!loggedIn && parsed.auth === undefined && parsed.apiKey === undefined) {
		issues.push(
			warning(
				"No `auth` or `apiKey`: this file holds no login (run: superset auth login)",
			),
		);
	}

	return {
		path,
		exists: true,
		valid: !issues.some((issue) => issue.severity === "error"),
		loggedIn,
		issues,
	};
}

export function checkConfigFile(
	path: string,
	now: number = Date.now(),
): ConfigCheckResult {
	let raw: string | undefined;
	try {
		raw = readFileSync(path, "utf-8");
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
			const detail = cause instanceof Error ? cause.message : String(cause);
			return {
				path,
				exists: true,
				valid: false,
				loggedIn: false,
				issues: [error(`Could not read the file: ${detail}`)],
			};
		}
	}
	return checkConfig(raw, path, now);
}
