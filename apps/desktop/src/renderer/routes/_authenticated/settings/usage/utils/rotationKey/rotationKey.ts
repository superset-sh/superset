import { accountRotationKey } from "@superset/shared/account-rotation";
import type { UsageAccount } from "../../hooks/useHostUsageQuota";

/**
 * The key the account engine files an account's "in rotation" flag under
 * (KTD4/R16). The host writes these keys, so the spelling is shared rather
 * than restated here.
 */
export function rotationKey(
	account: Pick<UsageAccount, "agent" | "accountId" | "selection">,
): string {
	return accountRotationKey(account);
}
