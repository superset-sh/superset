import { isIgnorableKey, normalizeToken } from "./chord";

const FN_SHORTCUT_TOKENS = new Set(["fn", "function", "globe"]);
const FN_LOCK_TOKENS = new Set(["fnlock"]);

export function normalizeFnShortcutToken(
	token: string,
): "fn" | "fnlock" | null {
	const normalized = normalizeToken(token);
	if (FN_SHORTCUT_TOKENS.has(normalized)) return "fn";
	if (FN_LOCK_TOKENS.has(normalized)) return "fnlock";
	return null;
}

export function isFnShortcutToken(token: string): boolean {
	return normalizeFnShortcutToken(token) !== null;
}

export function isStandaloneFnKeyEvent(event: KeyboardEvent): boolean {
	const code = normalizeToken(event.code ?? "");
	const key = normalizeToken(event.key ?? "");
	if (normalizeFnShortcutToken(code) === "fn") return true;
	if (normalizeFnShortcutToken(key) === "fn") return true;

	const fnActive =
		event.getModifierState?.("Fn") === true ||
		event.getModifierState?.("FnLock") === true;
	return fnActive && isIgnorableKey(code) && isIgnorableKey(key);
}
