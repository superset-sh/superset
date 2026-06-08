import { isV2OnlyUser } from "@superset/shared/v2-only-user";
import { authClient } from "renderer/lib/auth-client";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

/**
 * True for accounts created on/after V2_ONLY_USER_CUTOFF — these users
 * default to v2.
 */
export function useIsV2OnlyUser(): boolean {
	const { data: session } = authClient.useSession();
	return isV2OnlyUser(session?.user?.createdAt);
}

/** Returns whether v2 is currently active for this user. */
export function useIsV2CloudEnabled(): boolean {
	const v2Only = useIsV2OnlyUser();
	const optInV2 = useV2LocalOverrideStore((s) => s.optInV2);
	return optInV2 ?? v2Only;
}
