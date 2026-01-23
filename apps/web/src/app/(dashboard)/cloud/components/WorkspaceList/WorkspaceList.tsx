"use client";

import { Badge } from "@superset/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Cloud, GitBranch } from "lucide-react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";

export function WorkspaceList() {
	const trpc = useTRPC();

	const {
		data: workspaces,
		isLoading,
		isError,
	} = useQuery(trpc.cloudWorkspace.all.queryOptions());

	if (isLoading) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				Loading workspaces...
			</div>
		);
	}

	if (isError) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				Failed to load workspaces. Please try again.
			</div>
		);
	}

	if (!workspaces || workspaces.length === 0) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				No cloud workspaces found.
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{workspaces.map((workspace) => (
				<Link
					key={workspace.id}
					href={`/cloud/workspace/${workspace.id}`}
					className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
				>
					<div className="flex items-center gap-3">
						<Cloud className="size-5 text-muted-foreground" />
						<div>
							<p className="font-medium">{workspace.name}</p>
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<GitBranch className="size-3" />
								{workspace.branch}
								{workspace.repository && (
									<span className="ml-2">in {workspace.repository.name}</span>
								)}
							</div>
						</div>
					</div>
					<Badge variant="outline">Active</Badge>
				</Link>
			))}
		</div>
	);
}
