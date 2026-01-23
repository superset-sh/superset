import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

/**
 * Hook for cloud workspace mutations.
 * Calls the API directly and Electric SQL handles sync.
 */
export function useCloudWorkspaceMutations() {
	const [isPending, setIsPending] = useState(false);

	const createWorkspace = {
		isPending,
		mutate: async (
			params: {
				name: string;
				repositoryId: string;
				branch?: string;
				providerType?: "freestyle" | "fly";
				autoStopMinutes?: number;
			},
			options?: {
				onSuccess?: () => void;
				onError?: (error: Error) => void;
			},
		) => {
			setIsPending(true);
			try {
				await apiTrpcClient.cloudWorkspace.create.mutate({
					repositoryId: params.repositoryId,
					name: params.name,
					branch: params.branch,
					providerType: params.providerType ?? "freestyle",
					autoStopMinutes: params.autoStopMinutes,
				});
				toast.success("Cloud workspace created", {
					description: "Provisioning VM...",
				});
				options?.onSuccess?.();
			} catch (error) {
				const err =
					error instanceof Error ? error : new Error("Failed to create");
				toast.error("Failed to create cloud workspace", {
					description: err.message,
				});
				options?.onError?.(err);
			} finally {
				setIsPending(false);
			}
		},
	};

	const pauseWorkspace = {
		mutate: async (workspaceId: string) => {
			try {
				await apiTrpcClient.cloudWorkspace.pause.mutate({ workspaceId });
				toast.success("Workspace paused");
			} catch (error) {
				const err =
					error instanceof Error ? error : new Error("Failed to pause");
				toast.error("Failed to pause workspace", {
					description: err.message,
				});
			}
		},
	};

	const resumeWorkspace = {
		mutate: async (workspaceId: string) => {
			try {
				await apiTrpcClient.cloudWorkspace.resume.mutate({ workspaceId });
				toast.success("Workspace resumed");
			} catch (error) {
				const err =
					error instanceof Error ? error : new Error("Failed to resume");
				toast.error("Failed to resume workspace", {
					description: err.message,
				});
			}
		},
	};

	const stopWorkspace = {
		mutate: async (workspaceId: string) => {
			try {
				await apiTrpcClient.cloudWorkspace.stop.mutate({ workspaceId });
				toast.success("Workspace stopped");
			} catch (error) {
				const err =
					error instanceof Error ? error : new Error("Failed to stop");
				toast.error("Failed to stop workspace", {
					description: err.message,
				});
			}
		},
	};

	const deleteWorkspace = {
		mutate: async (workspaceId: string) => {
			try {
				await apiTrpcClient.cloudWorkspace.delete.mutate({ workspaceId });
				toast.success("Workspace deleted");
			} catch (error) {
				const err =
					error instanceof Error ? error : new Error("Failed to delete");
				toast.error("Failed to delete workspace", {
					description: err.message,
				});
			}
		},
	};

	return {
		createWorkspace,
		pauseWorkspace,
		resumeWorkspace,
		stopWorkspace,
		deleteWorkspace,
		isReady: true,
	};
}
