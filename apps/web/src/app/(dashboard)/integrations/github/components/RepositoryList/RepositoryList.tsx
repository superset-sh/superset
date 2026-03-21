"use client";

import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Lock, RefreshCw, Unlock } from "lucide-react";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

interface RepositoryListProps {
	organizationId: string;
}

export function RepositoryList({ organizationId }: RepositoryListProps) {
	const trpc = useTRPC();

	const {
		data: repositories,
		isLoading,
		isError,
		refetch,
	} = useQuery(
		trpc.integration.github.listRepositories.queryOptions({
			organizationId,
		}),
	);

	const syncMutation = useMutation(
		trpc.integration.github.triggerSync.mutationOptions({
			onSuccess: () => {
				toast.success("Sync started", {
					description: "Repositories will be updated shortly.",
				});
				// Refetch after a short delay to allow sync to complete
				setTimeout(() => refetch(), 3000);
			},
			onError: (error) => {
				toast.error("Sync failed", {
					description: error.message,
				});
			},
		}),
	);

	const handleSync = () => {
		syncMutation.mutate({ organizationId });
	};

	const queryClient = useQueryClient();
	const [togglingRepoId, setTogglingRepoId] = useState<string | null>(null);

	const toggleIssueSyncMutation = useMutation(
		trpc.integration.github.toggleIssueSync.mutationOptions({
			onMutate: (variables) => {
				setTogglingRepoId(variables.repositoryId);
			},
			onSettled: () => {
				setTogglingRepoId(null);
			},
			onSuccess: (_data, variables) => {
				toast.success(
					variables.enabled ? "Issue sync enabled" : "Issue sync disabled",
					{
						description: variables.enabled
							? "Existing issues will be imported shortly."
							: "Issues will no longer sync from this repo.",
					},
				);
				queryClient.invalidateQueries({
					queryKey: trpc.integration.github.listRepositories.queryOptions({
						organizationId,
					}).queryKey,
				});
			},
			onError: (error) => {
				toast.error("Failed to update issue sync", {
					description: error.message,
				});
			},
		}),
	);

	const isSyncing = syncMutation.isPending;

	if (isLoading) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				Loading repositories...
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center gap-4 py-8">
				<p className="text-center text-muted-foreground">
					Failed to load repositories. Please try again.
				</p>
				<Button onClick={() => refetch()} variant="outline">
					<RefreshCw className="mr-2 size-4" />
					Retry
				</Button>
			</div>
		);
	}

	if (!repositories || repositories.length === 0) {
		return (
			<div className="flex flex-col items-center gap-4 py-8">
				<p className="text-center text-muted-foreground">
					No repositories found. Make sure your GitHub App has access to
					repositories.
				</p>
				<Button onClick={handleSync} disabled={isSyncing} variant="outline">
					<RefreshCw
						className={`mr-2 size-4 ${isSyncing ? "animate-spin" : ""}`}
					/>
					{isSyncing ? "Syncing..." : "Sync Repositories"}
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{repositories.length}{" "}
					{repositories.length === 1 ? "repository" : "repositories"}
				</p>
				<Button
					onClick={handleSync}
					disabled={isSyncing}
					variant="outline"
					size="sm"
				>
					<RefreshCw
						className={`mr-2 size-3 ${isSyncing ? "animate-spin" : ""}`}
					/>
					{isSyncing ? "Syncing..." : "Sync"}
				</Button>
			</div>
			<div className="space-y-2">
				{repositories.map((repo) => (
					<div
						key={repo.id}
						className="flex items-center justify-between rounded-lg border p-3"
					>
						<div className="flex items-center gap-3">
							{repo.isPrivate ? (
								<Lock className="size-4 text-muted-foreground" />
							) : (
								<Unlock className="size-4 text-muted-foreground" />
							)}
							<div>
								<p className="font-medium">{repo.fullName}</p>
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<GitBranch className="size-3" />
									{repo.defaultBranch}
								</div>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Switch
								id={`issue-sync-${repo.id}`}
								checked={repo.issueSyncEnabled}
								disabled={togglingRepoId === repo.id}
								onCheckedChange={(checked) => {
									toggleIssueSyncMutation.mutate({
										organizationId,
										repositoryId: repo.id,
										enabled: checked,
									});
								}}
							/>
							<Label
								htmlFor={`issue-sync-${repo.id}`}
								className="text-sm text-muted-foreground"
							>
								Sync Issues
							</Label>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
