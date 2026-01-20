"use client";

import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, Lock, RefreshCw, Unlock } from "lucide-react";
import { useState } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface RepositoryListProps {
	organizationId: string;
}

export function RepositoryList({ organizationId }: RepositoryListProps) {
	const trpc = useTRPC();
	const [isSyncing, setIsSyncing] = useState(false);

	const { data: repositories, isLoading, refetch } = useQuery(
		trpc.integration.github.listRepositories.queryOptions({
			organizationId,
		}),
	);

	const handleSync = async () => {
		setIsSyncing(true);
		try {
			const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/github/sync`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ organizationId }),
			});
			const result = await response.json();
			if (result.success) {
				await refetch();
			} else {
				console.error("[github/sync] Sync failed:", result.error);
			}
		} catch (error) {
			console.error("[github/sync] Sync error:", error);
		} finally {
			setIsSyncing(false);
		}
	};

	if (isLoading) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				Loading repositories...
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
					<RefreshCw className={`mr-2 size-4 ${isSyncing ? "animate-spin" : ""}`} />
					{isSyncing ? "Syncing..." : "Sync Repositories"}
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{repositories.length} {repositories.length === 1 ? "repository" : "repositories"}
				</p>
				<Button onClick={handleSync} disabled={isSyncing} variant="outline" size="sm">
					<RefreshCw className={`mr-2 size-3 ${isSyncing ? "animate-spin" : ""}`} />
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
