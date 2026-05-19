import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface RenameV2WorkspaceTransaction {
	isPersisted: { promise: Promise<unknown> };
}

interface RenameV2WorkspaceCollection {
	get(workspaceId: string): unknown;
	update(
		workspaceId: string,
		mutator: (draft: { name: string }) => void,
	): RenameV2WorkspaceTransaction;
}

interface RenameV2WorkspaceApiClient {
	v2Workspace: {
		update: {
			mutate: (input: { id: string; name: string }) => Promise<unknown>;
		};
	};
}

/**
 * Build a PersistableTransaction for renaming a v2 workspace.
 *
 * When the workspace is in the local TanStack collection, use the optimistic
 * collection.update path for instant UI feedback. When it isn't — host has
 * the row but the Electric/TanStack v2_workspaces cache is missing it
 * (see #4587) — collection.update would throw UpdateKeyNotFoundError before
 * the API call even fires, breaking the rename UX. Fall back to the API
 * directly; Electric sync will catch up on the next tick.
 */
export function renameV2Workspace({
	collection,
	workspaceId,
	name,
	apiClient = apiTrpcClient,
}: {
	collection: RenameV2WorkspaceCollection;
	workspaceId: string;
	name: string;
	apiClient?: RenameV2WorkspaceApiClient;
}): RenameV2WorkspaceTransaction {
	if (collection.get(workspaceId) === undefined) {
		const promise = apiClient.v2Workspace.update.mutate({
			id: workspaceId,
			name,
		});
		return { isPersisted: { promise } };
	}
	return collection.update(workspaceId, (draft) => {
		draft.name = name;
	});
}
