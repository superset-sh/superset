import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { workspaceTrpc } from "renderer/lib/workspace-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { WorkspaceChat } from "./components/WorkspaceChat";
import { WorkspaceTerminal } from "./components/WorkspaceTerminal";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
});

function V2WorkspacePage() {
	const { workspaceId } = Route.useParams();
	const collections = useCollections();

	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, workspaceId)),
		[collections, workspaceId],
	);
	const workspace = workspaces[0] ?? null;

	const { data: projects = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2Projects: collections.v2Projects })
				.where(({ v2Projects }) =>
					eq(v2Projects.id, workspace?.projectId ?? ""),
				),
		[collections, workspace?.projectId],
	);
	const project = projects[0] ?? null;

	if (!workspace) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Workspace not found
			</div>
		);
	}

	return (
		<V2WorkspaceContent
			workspaceId={workspace.id}
			workspaceName={workspace.name}
			workspaceBranch={workspace.branch}
			projectName={project?.name ?? "Unknown project"}
		/>
	);
}

function V2WorkspaceContent({
	workspaceName,
	workspaceBranch,
	projectName,
	workspaceId,
}: {
	workspaceName: string;
	workspaceBranch: string;
	projectName: string;
	workspaceId: string;
}) {
	const [activeView, setActiveView] = useState<"overview" | "chat">("overview");
	const healthQuery = workspaceTrpc.health.info.useQuery();
	const githubUserQuery = workspaceTrpc.github.getUser.useQuery();
	const gitStatusQuery = workspaceTrpc.workspace.gitStatus.useQuery({
		id: workspaceId,
	});

	return (
		<div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
			<div className="border-b border-border px-6 py-4">
				<div className="mb-3">
					<h1 className="text-xl font-semibold">{workspaceName}</h1>
					<p className="text-sm text-muted-foreground">
						{projectName} &middot; {workspaceBranch}
					</p>
				</div>
				<Tabs
					onValueChange={(value) => setActiveView(value as "overview" | "chat")}
					value={activeView}
				>
					<TabsList className="grid w-fit grid-cols-2">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="chat">Chat</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>

			{activeView === "chat" ? (
				<WorkspaceChat
					workspaceId={workspaceId}
					workspaceName={workspaceName}
				/>
			) : (
				<div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-6">
					<WorkspaceTerminal workspaceId={workspaceId} />

					<div className="space-y-4">
						<Section title="health.info" query={healthQuery} />
						<Section title="github.getUser" query={githubUserQuery} />
						<Section title="workspace.gitStatus" query={gitStatusQuery} />
					</div>
				</div>
			)}
		</div>
	);
}

function Section({
	title,
	query,
}: {
	title: string;
	query: {
		data: unknown;
		error: { message: string } | null;
		isPending: boolean;
	};
}) {
	return (
		<div className="w-full rounded-lg border border-border p-4">
			<h2 className="mb-2 text-sm font-medium">{title}</h2>
			{query.isPending ? (
				<p className="text-xs text-muted-foreground">Loading...</p>
			) : query.error ? (
				<pre className="whitespace-pre-wrap text-xs text-destructive">
					{query.error.message}
				</pre>
			) : (
				<pre className="whitespace-pre-wrap text-xs text-muted-foreground">
					{JSON.stringify(query.data, null, 2)}
				</pre>
			)}
		</div>
	);
}
