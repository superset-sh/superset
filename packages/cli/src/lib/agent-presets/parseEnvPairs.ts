import { CLIError } from "@superset/cli-framework";

/**
 * Keys the record cannot carry to the host. `__proto__` assigns through the
 * inherited setter and never becomes an entry; SuperJSON, the transformer on
 * the host tRPC link, throws on all three. Refusing them here turns a silently
 * dropped variable and an opaque transport failure into an actionable error.
 */
const UNSUPPORTED_ENV_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Parse repeatable `--env KEY=VALUE` flags into the record the host stores.
 *
 * Split on the first `=` only, so values may contain `=` (a connection
 * string, a base64 token). A later pair wins over an earlier one with the
 * same key, matching how a shell's own `KEY=v1 KEY=v2` assignment behaves.
 */
export function parseEnvPairs(pairs: string[]): Record<string, string> {
	const env: Record<string, string> = {};
	for (const pair of pairs) {
		const separator = pair.indexOf("=");
		const key = separator === -1 ? "" : pair.slice(0, separator).trim();
		if (!key) {
			throw new CLIError(
				`Invalid --env value: ${JSON.stringify(pair)}`,
				"Pass KEY=VALUE, e.g. --env ANTHROPIC_LOG=debug",
			);
		}
		if (UNSUPPORTED_ENV_KEYS.has(key)) {
			throw new CLIError(
				`Unsupported --env name: ${JSON.stringify(key)}`,
				"Rename the variable. __proto__, constructor and prototype cannot be sent to the host.",
			);
		}
		env[key] = pair.slice(separator + 1);
	}
	return env;
}
