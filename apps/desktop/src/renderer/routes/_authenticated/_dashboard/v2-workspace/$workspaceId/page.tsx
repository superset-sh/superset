import type { ExternalApp } from "@superset/local-db";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { workspaceTrpc } from "renderer/lib/workspace-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	CommandPalette,
	useCommandPalette,
} from "renderer/screens/main/components/CommandPalette";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { WorkspaceChat } from "./components/WorkspaceChat";
import { WorkspaceFiles } from "./components/WorkspaceFiles";
import { WorkspaceTerminal } from "./components/WorkspaceTerminal";

type V2WorkspaceSearch = {
	file?: string;
	view?: "overview" | "chat" | "files";
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
	validateSearch: (search: Record<string, unknown>): V2WorkspaceSearch => ({
		file: typeof search.file === "string" ? search.file : undefined,
		view: ["overview", "chat", "files"].includes(search.view as string)
			? (search.view as V2WorkspaceSearch["view"])
			: undefined,
	}),
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
			projectId={workspace.projectId}
			workspaceId={workspace.id}
			workspaceBranch={workspace.branch}
			workspaceName={workspace.name}
			projectName={project?.name ?? "Unknown project"}
		/>
	);
}

function V2WorkspaceContent({
	projectId,
	workspaceName,
	workspaceBranch,
	projectName,
	workspaceId,
}: {
	projectId: string;
	workspaceName: string;
	workspaceBranch: string;
	projectName: string;
	workspaceId: string;
}) {
	const navigate = Route.useNavigate();
	const { file: selectedFilePath, view } = Route.useSearch();
	const activeView = view ?? "overview";
	const healthQuery = workspaceTrpc.health.info.useQuery();
	const githubUserQuery = workspaceTrpc.github.getUser.useQuery();
	const gitStatusQuery = workspaceTrpc.workspace.gitStatus.useQuery({
		id: workspaceId,
	});
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspaceQuery.data?.worktreePath;
	const utils = electronTrpc.useUtils();
	const { data: defaultApp } = electronTrpc.projects.getDefaultApp.useQuery(
		{ projectId },
		{ enabled: !!projectId, staleTime: 30000 },
	);
	const resolvedDefaultApp: ExternalApp = defaultApp ?? "cursor";
	const { mutate: mutateOpenInApp } =
		electronTrpc.external.openInApp.useMutation({
			onSuccess: () => {
				utils.projects.getDefaultApp.invalidate({ projectId });
			},
		});
	const commandPalette = useCommandPalette({
		workspaceId,
		navigate,
		onSelectFile: ({
			close,
			filePath,
			targetWorkspaceId,
			navigate: routerNavigate,
		}) => {
			close();
			void routerNavigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: targetWorkspaceId },
				search: (current) => ({
					...current,
					file: filePath,
					view: "files",
				}),
			});
		},
	});

	const setActiveView = (nextView: "overview" | "chat" | "files") => {
		void navigate({
			search: (current) => ({
				...current,
				view: nextView,
			}),
		});
	};

	const handleSelectFile = (absolutePath: string) => {
		void navigate({
			search: (current) => ({
				...current,
				file: absolutePath,
				view: "files",
			}),
		});
	};

	const handleQuickOpen = () => {
		commandPalette.toggle();
	};

	const handleOpenInApp = useCallback(() => {
		if (!worktreePath) return;
		mutateOpenInApp({
			path: worktreePath,
			app: resolvedDefaultApp,
			projectId,
		});
	}, [mutateOpenInApp, projectId, resolvedDefaultApp, worktreePath]);

	useAppHotkey("QUICK_OPEN", handleQuickOpen, undefined, [handleQuickOpen]);
	useAppHotkey("OPEN_IN_APP", handleOpenInApp, undefined, [handleOpenInApp]);

	return (
		<>
			<div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
				<div className="border-b border-border px-6 py-4">
					<div className="mb-3">
						<h1 className="text-xl font-semibold">{workspaceName}</h1>
						<p className="text-sm text-muted-foreground">
							{projectName} &middot; {workspaceBranch}
						</p>
					</div>
					<Tabs
						onValueChange={(value) =>
							setActiveView(value as "overview" | "chat" | "files")
						}
						value={activeView}
					>
						<TabsList className="grid w-fit grid-cols-3">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="files">Files</TabsTrigger>
							<TabsTrigger value="chat">Chat</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				{activeView === "chat" ? (
					<WorkspaceChat
						workspaceId={workspaceId}
						workspaceName={workspaceName}
					/>
				) : activeView === "files" ? (
					<WorkspaceFiles
						onSelectFile={handleSelectFile}
						selectedFilePath={selectedFilePath}
						workspaceId={workspaceId}
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
			<CommandPalette
				open={commandPalette.open}
				onOpenChange={commandPalette.handleOpenChange}
				query={commandPalette.query}
				onQueryChange={commandPalette.setQuery}
				filtersOpen={commandPalette.filtersOpen}
				onFiltersOpenChange={commandPalette.setFiltersOpen}
				includePattern={commandPalette.includePattern}
				onIncludePatternChange={commandPalette.setIncludePattern}
				excludePattern={commandPalette.excludePattern}
				onExcludePatternChange={commandPalette.setExcludePattern}
				isLoading={commandPalette.isFetching}
				searchResults={commandPalette.searchResults}
				onSelectFile={commandPalette.selectFile}
				scope={commandPalette.scope}
				onScopeChange={commandPalette.setScope}
				workspaceName={workspaceName}
			/>
		</>
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
