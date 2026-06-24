"use client";

import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GitBranch, Lock, RefreshCw, Unlock } from "lucide-react";
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
		trpc.integration.gitlab.listRepositories.queryOptions({ organizationId }),
	);

	const syncMutation = useMutation(
		trpc.integration.gitlab.triggerSync.mutationOptions({
			onSuccess: () => {
				toast.success("Sync started", {
					description: "Projects will be updated shortly.",
				});
				setTimeout(() => refetch(), 3000);
			},
			onError: (error) => {
				toast.error("Sync failed", { description: error.message });
			},
		}),
	);

	const isSyncing = syncMutation.isPending;
	const handleSync = () => syncMutation.mutate({ organizationId });

	if (isLoading) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				Loading projects...
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center gap-4 py-8">
				<p className="text-center text-muted-foreground">
					Failed to load projects. Please try again.
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
					No projects synced yet. Run a sync to pull them from the group.
				</p>
				<Button onClick={handleSync} disabled={isSyncing} variant="outline">
					<RefreshCw
						className={`mr-2 size-4 ${isSyncing ? "animate-spin" : ""}`}
					/>
					{isSyncing ? "Syncing..." : "Sync Projects"}
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{repositories.length}{" "}
					{repositories.length === 1 ? "project" : "projects"}
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
						<Badge variant={repo.isPrivate ? "secondary" : "outline"}>
							{repo.isPrivate ? "Private" : "Public"}
						</Badge>
					</div>
				))}
			</div>
		</div>
	);
}
