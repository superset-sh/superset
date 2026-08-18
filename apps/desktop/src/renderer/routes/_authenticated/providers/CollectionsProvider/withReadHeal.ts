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
 *
 * Parsing is per-row tolerant, which is why every localStorage collection
 * applies this wrapper even without a custom `heal`: the library hydrates the
 * whole store inside one try/catch, so a single malformed entry (or a heal
 * throw) escaping to it discards every row — and the next mutation persists
 * that emptiness. Bad entries are dropped here instead, so the rest survive.
 */
export function withReadHeal<T>(
	options: T,
	heal: (raw: unknown) => unknown = (raw) => raw,
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
					!value ||
					typeof value !== "object" ||
					!("versionKey" in value) ||
					!("data" in value)
				) {
					console.warn(
						`[withReadHeal] Dropping malformed stored entry "${key}"`,
					);
					continue;
				}
				const entry = value as { versionKey: unknown; data: unknown };
				try {
					result[key] = { ...entry, data: heal(entry.data) };
				} catch (error) {
					console.warn(
						`[withReadHeal] Dropping unhealable stored entry "${key}"`,
						error,
					);
				}
			}
			return result;
		},
	};
	return { ...options, parser: healingParser } as T;
}
