"use client";

import { Badge } from "@superset/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, Lock, Unlock } from "lucide-react";
import { useTRPC } from "@/trpc/react";

interface RepositoryListProps {
	organizationId: string;
}

export function RepositoryList({ organizationId }: RepositoryListProps) {
	const trpc = useTRPC();

	const { data: repositories, isLoading } = useQuery(
		trpc.integration.github.listRepositories.queryOptions({
			organizationId,
		}),
	);

	if (isLoading) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				Loading repositories...
			</div>
		);
	}

	if (!repositories || repositories.length === 0) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				No repositories found. Make sure your GitHub App has access to
				repositories.
			</div>
		);
	}

	return (
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
	);
}
