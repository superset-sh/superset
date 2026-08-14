import { cloudTrpc } from "renderer/lib/cloud-trpc";

export interface LinearInitiative {
	id: string;
	name: string;
	projectIds: string[];
}

interface UseLinearInitiativesParams {
	organizationId: string | null;
	enabled: boolean;
}

export function useLinearInitiatives({
	organizationId,
	enabled,
}: UseLinearInitiativesParams) {
	return cloudTrpc.integration.linear.getInitiatives.useQuery(
		{ organizationId: organizationId ?? "" },
		{
			enabled: enabled && organizationId !== null,
			staleTime: 5 * 60 * 1000,
		},
	);
}
