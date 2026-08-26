import { env } from "renderer/env.renderer";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";

/**
 * The organization THIS window is showing.
 *
 * The single sanctioned way to read the active org in the renderer. The login
 * session also carries an `activeOrganizationId`, but it is shared by every
 * window: reading it means a window switched to another org renders — and
 * writes — against whatever org some other window last selected. That is the
 * bug this hook exists to make hard to reintroduce, so prefer it everywhere
 * except genuinely account-wide reads (membership, auth token, analytics
 * identity), which are allowlisted in the accompanying test.
 *
 * Cloud reads are additionally scoped server-side by the organization header
 * the cloud tRPC client sends for this window, so most call sites only need
 * this value for filtering, comparisons, and mutation inputs.
 */
export function useActiveOrganizationId(): string | null {
	const collections = useCollections();
	if (env.SKIP_ENV_VALIDATION) return MOCK_ORG_ID;
	return collections.activeOrganizationId ?? null;
}
