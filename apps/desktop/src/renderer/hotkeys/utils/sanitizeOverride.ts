import { canonicalizeChord, MODIFIERS } from "./resolveHotkeyFromEvent";

/**
 * Validates a migrated override string. Drops pre-fix garbage
 * (`ctrl+control`, `ctrl+shift+@`, `meta+[`) that the old recorder could
 * produce and that would never match `event.code`-based dispatch.
 *
 * - Returns the canonicalized chord on success.
 * - Returns `null` to preserve an explicit unassignment.
 * - Returns `undefined` to signal the caller should drop the entry.
 */
export function sanitizeOverride(value: unknown): string | null | undefined {
	if (value === null) return null;
	if (typeof value !== "string" || !value.trim()) return undefined;
	const canonical = canonicalizeChord(value);
	const keys = canonical.split("+").filter((p) => !MODIFIERS.has(p));
	if (keys.length !== 1 || !/^[a-z0-9]+$/.test(keys[0])) return undefined;
	return canonical;
}
