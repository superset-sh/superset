/**
 * R16: the key the account engine files an account's "in rotation" flag
 * under. Deliberately not the account's `accountKey`, which identifies the
 * credential *source* (a config path or keychain item) and therefore moves
 * when a login is swapped between dirs — rotation follows the provider's own
 * account identity, falling back to the profile dir and finally to the
 * system-default login, which has neither.
 *
 * It lives here because the host writes these keys and the renderer reads
 * them: two spellings would silently lose every toggle.
 */
export function accountRotationKey(account: {
	agent: string;
	accountId: string | null;
	selection: string | null;
}): string {
	return `${account.agent}:${account.accountId ?? account.selection ?? "default"}`;
}
