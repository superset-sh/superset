import type { UsageAccount } from "../../hooks/useHostUsageQuota";

/**
 * The key the account engine files an account's "in rotation" flag under
 * (KTD4/R16). Deliberately not `account.accountKey`, which identifies the
 * credential *source* (a config path or keychain item) and therefore moves
 * when a login is swapped between dirs — rotation follows the provider's
 * account identity, falling back to the profile dir and finally to the
 * system-default login, which has neither.
 */
export function rotationKey(
	account: Pick<UsageAccount, "agent" | "accountId" | "selection">,
): string {
	return `${account.agent}:${account.accountId ?? account.selection ?? "default"}`;
}
