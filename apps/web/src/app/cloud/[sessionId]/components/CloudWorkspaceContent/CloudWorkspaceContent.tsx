"use client";

import { Badge } from "@superset/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@superset/ui/card";
import { LuCloud, LuGitBranch, LuGithub } from "react-icons/lu";

interface CloudWorkspace {
	id: string;
	sessionId: string;
	title: string;
	repoOwner: string;
	repoName: string;
	branch: string;
	baseBranch: string;
	status: string;
	sandboxStatus: string | null;
	model: string | null;
	linearIssueKey: string | null;
	prUrl: string | null;
	prNumber: number | null;
	createdAt: Date;
	updatedAt: Date;
}

interface CloudWorkspaceContentProps {
	workspace: CloudWorkspace;
}

export function CloudWorkspaceContent({
	workspace,
}: CloudWorkspaceContentProps) {
	return (
		<div className="flex h-screen flex-col bg-background">
			{/* Header */}
			<header className="flex items-center gap-3 border-b px-4 py-3">
				<LuCloud className="size-5 text-muted-foreground" />
				<div className="flex-1">
					<h1 className="text-lg font-semibold">{workspace.title}</h1>
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<LuGithub className="size-3.5" />
						<span>
							{workspace.repoOwner}/{workspace.repoName}
						</span>
						<LuGitBranch className="ml-2 size-3.5" />
						<span>{workspace.branch}</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant="outline">{workspace.status}</Badge>
					{workspace.sandboxStatus && (
						<Badge
							variant={
								workspace.sandboxStatus === "ready" ? "default" : "secondary"
							}
						>
							{workspace.sandboxStatus}
						</Badge>
					)}
				</div>
			</header>

			{/* Main content area */}
			<main className="flex flex-1 items-center justify-center p-8">
				<Card className="max-w-lg">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<LuCloud className="size-5" />
							Cloud Workspace
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-muted-foreground">
							This cloud workspace is connected to{" "}
							<strong>
								{workspace.repoOwner}/{workspace.repoName}
							</strong>{" "}
							on branch <strong>{workspace.branch}</strong>.
						</p>

						<div className="rounded-md bg-muted p-4 text-sm">
							<p className="font-medium">Session ID</p>
							<code className="text-xs text-muted-foreground">
								{workspace.sessionId}
							</code>
						</div>

						<p className="text-sm text-muted-foreground">
							The cloud workspace terminal and AI agent interface will be
							implemented here. This connects to the control plane to manage
							sandbox environments.
						</p>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
