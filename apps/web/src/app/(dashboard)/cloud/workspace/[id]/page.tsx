"use client";

import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Cloud, ExternalLink, GitBranch } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTRPC } from "@/trpc/react";

export default function WorkspaceDetailPage() {
	const params = useParams();
	const id = params.id as string;

	const trpc = useTRPC();

	const {
		data: workspace,
		isLoading,
		isError,
	} = useQuery(trpc.cloudWorkspace.byId.queryOptions(id));

	if (isLoading) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				Loading workspace...
			</div>
		);
	}

	if (isError || !workspace) {
		return (
			<div className="space-y-4">
				<Link
					href="/cloud"
					className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" />
					Back to Cloud Workspaces
				</Link>
				<div className="py-8 text-center text-muted-foreground">
					Workspace not found.
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<Link
				href="/cloud"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				Back to Cloud Workspaces
			</Link>

			<div className="flex items-start gap-4">
				<div className="flex size-12 items-center justify-center rounded-lg border bg-card">
					<Cloud className="size-6 text-muted-foreground" />
				</div>
				<div>
					<h1 className="text-2xl font-semibold">{workspace.name}</h1>
					<div className="mt-1 flex items-center gap-2 text-muted-foreground">
						<GitBranch className="size-4" />
						<span>{workspace.branch}</span>
					</div>
				</div>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<div className="space-y-4 rounded-lg border p-4">
					<h2 className="font-medium">Workspace Details</h2>
					<dl className="space-y-2 text-sm">
						<div className="flex justify-between">
							<dt className="text-muted-foreground">Name</dt>
							<dd>{workspace.name}</dd>
						</div>
						<div className="flex justify-between">
							<dt className="text-muted-foreground">Branch</dt>
							<dd>{workspace.branch}</dd>
						</div>
						<div className="flex justify-between">
							<dt className="text-muted-foreground">Created</dt>
							<dd>{new Date(workspace.createdAt).toLocaleDateString()}</dd>
						</div>
					</dl>
				</div>

				{workspace.repository && (
					<div className="space-y-4 rounded-lg border p-4">
						<h2 className="font-medium">Repository</h2>
						<dl className="space-y-2 text-sm">
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Name</dt>
								<dd>{workspace.repository.name}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Owner</dt>
								<dd>{workspace.repository.repoOwner}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Default Branch</dt>
								<dd>{workspace.repository.defaultBranch}</dd>
							</div>
						</dl>
						<Button variant="outline" size="sm" asChild>
							<a
								href={workspace.repository.repoUrl}
								target="_blank"
								rel="noopener noreferrer"
							>
								<ExternalLink className="mr-2 size-4" />
								View on GitHub
							</a>
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
