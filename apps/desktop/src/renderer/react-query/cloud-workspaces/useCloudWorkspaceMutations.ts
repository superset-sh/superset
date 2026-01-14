import type { SelectCloudWorkspace } from "@superset/db/schema";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import {
	useApiClient,
	useCollections,
} from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface CreateCloudWorkspaceInput {
	organizationId: string;
	repositoryId: string;
	name: string;
	branch: string;
	providerType?: "freestyle" | "fly";
	autoStopMinutes?: number;
}

/**
 * Create a new cloud workspace using the collection insert method
 */
export function useCreateCloudWorkspace(options?: {
	onSuccess?: () => void;
	onError?: (error: Error) => void;
}) {
	const collections = useCollections();

	const mutate = useCallback(
		async (input: CreateCloudWorkspaceInput) => {
			const newWorkspace: SelectCloudWorkspace = {
				id: crypto.randomUUID(),
				organizationId: input.organizationId,
				repositoryId: input.repositoryId,
				name: input.name,
				branch: input.branch,
				providerType: input.providerType ?? "freestyle",
				providerVmId: null,
				status: "provisioning",
				statusMessage: null,
				creatorId: "", // Will be set by backend
				autoStopMinutes: input.autoStopMinutes ?? 30,
				lastActiveAt: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			try {
				collections.cloudWorkspaces.insert(newWorkspace);
				toast.success("Cloud workspace created", {
					description: "Provisioning VM...",
				});
				options?.onSuccess?.();
			} catch (error) {
				const err = error instanceof Error ? error : new Error("Unknown error");
				toast.error("Failed to create cloud workspace", {
					description: err.message,
				});
				options?.onError?.(err);
				throw err;
			}
		},
		[collections, options],
	);

	return {
		mutate,
		mutateAsync: mutate,
		isPending: false,
	};
}

/**
 * Pause a running cloud workspace
 */
export function usePauseCloudWorkspace() {
	const apiClient = useApiClient();

	return useMutation({
		mutationFn: async ({ workspaceId }: { workspaceId: string }) => {
			return apiClient.cloudWorkspace.pause.mutate({ workspaceId });
		},
		onSuccess: () => {
			toast.success("Cloud workspace paused");
		},
		onError: (error: Error) => {
			toast.error("Failed to pause workspace", {
				description: error.message,
			});
		},
	});
}

/**
 * Resume a paused cloud workspace
 */
export function useResumeCloudWorkspace() {
	const apiClient = useApiClient();

	return useMutation({
		mutationFn: async ({ workspaceId }: { workspaceId: string }) => {
			return apiClient.cloudWorkspace.resume.mutate({ workspaceId });
		},
		onSuccess: () => {
			toast.success("Cloud workspace resumed");
		},
		onError: (error: Error) => {
			toast.error("Failed to resume workspace", {
				description: error.message,
			});
		},
	});
}

/**
 * Stop a cloud workspace
 */
export function useStopCloudWorkspace() {
	const apiClient = useApiClient();

	return useMutation({
		mutationFn: async ({ workspaceId }: { workspaceId: string }) => {
			return apiClient.cloudWorkspace.stop.mutate({ workspaceId });
		},
		onSuccess: () => {
			toast.success("Cloud workspace stopped");
		},
		onError: (error: Error) => {
			toast.error("Failed to stop workspace", {
				description: error.message,
			});
		},
	});
}

/**
 * Delete a cloud workspace
 */
export function useDeleteCloudWorkspace() {
	const collections = useCollections();

	return useMutation({
		mutationFn: async ({ workspaceId }: { workspaceId: string }) => {
			collections.cloudWorkspaces.delete(workspaceId);
		},
		onSuccess: () => {
			toast.success("Cloud workspace deleted");
		},
		onError: (error: Error) => {
			toast.error("Failed to delete workspace", {
				description: error.message,
			});
		},
	});
}

/**
 * Join a cloud workspace session
 */
export function useJoinCloudWorkspace() {
	const apiClient = useApiClient();

	return useMutation({
		mutationFn: async ({
			workspaceId,
			clientType,
		}: {
			workspaceId: string;
			clientType: "desktop" | "web";
		}) => {
			return apiClient.cloudWorkspace.join.mutate({ workspaceId, clientType });
		},
		onError: (error: Error) => {
			toast.error("Failed to join workspace session", {
				description: error.message,
			});
		},
	});
}

/**
 * Leave a cloud workspace session
 */
export function useLeaveCloudWorkspace() {
	const apiClient = useApiClient();

	return useMutation({
		mutationFn: async ({ sessionId }: { sessionId: string }) => {
			return apiClient.cloudWorkspace.leave.mutate({ sessionId });
		},
	});
}
