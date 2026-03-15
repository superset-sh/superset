import { useCallback, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface V2CreateWorkspaceInput {
	projectId: string;
	name: string;
	branch: string;
	deviceId?: string;
}

export function useV2CreateWorkspace() {
	const [isPending, setIsPending] = useState(false);

	const createWorkspace = useCallback(async (input: V2CreateWorkspaceInput) => {
		setIsPending(true);
		try {
			return await apiTrpcClient.v2Workspace.create.mutate(input);
		} finally {
			setIsPending(false);
		}
	}, []);

	return { createWorkspace, isPending };
}
