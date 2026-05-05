import type { Parser } from "@tanstack/react-db";

/**
 * `@tanstack/db`'s `localStorageCollectionOptions` only runs the configured
 * schema on writes — reads return whatever shape was last persisted. So a row
 * written before a field was added comes back with that field undefined and
 * crashes downstream consumers.
 *
 * This wrapper installs a custom `parser` whose `.parse` runs each stored
 * entry's `data` through `heal`, so collections expose a normalized shape
 * regardless of when the row was first written. Writes are unaffected and
 * naturally rewrite the healed shape to storage on the next mutation.
 *
 * The library expects parsed entries to have `{ versionKey, data }` — we
 * preserve that envelope and only reshape `data`.
 */
export function withReadHeal<T>(
	options: T,
	heal: (raw: unknown) => unknown,
): T {
	const baseParser: Parser = (options as { parser?: Parser }).parser ?? JSON;
	const healingParser: Parser = {
		stringify: (value) => baseParser.stringify(value),
		parse: (raw) => {
			const parsed = baseParser.parse(raw);
			if (
				typeof parsed !== "object" ||
				parsed === null ||
				Array.isArray(parsed)
			) {
				return parsed;
			}
			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(parsed)) {
				if (
					value &&
					typeof value === "object" &&
					"versionKey" in value &&
					"data" in value
				) {
					const entry = value as { versionKey: unknown; data: unknown };
					result[key] = { ...entry, data: heal(entry.data) };
				} else {
					result[key] = value;
				}
			}
			return result;
		},
	};
	return { ...options, parser: healingParser } as T;
}
