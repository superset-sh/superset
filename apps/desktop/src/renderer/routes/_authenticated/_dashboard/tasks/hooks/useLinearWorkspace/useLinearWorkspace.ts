import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const WORKSPACE_STALE_MS = 10 * 60_000;

export function useLinearConnection() {
	const organizationId = useActiveOrganizationId();
	return cloudTrpc.integration.linear.getConnection.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: !!organizationId },
	);
}

export function useLinearWorkspace({ enabled = true } = {}) {
	const organizationId = useActiveOrganizationId();
	return cloudTrpc.integration.linear.workspace.useQuery(
		{ organizationId: organizationId ?? "" },
		{
			enabled: enabled && !!organizationId,
			staleTime: WORKSPACE_STALE_MS,
			retry: false,
		},
	);
}
