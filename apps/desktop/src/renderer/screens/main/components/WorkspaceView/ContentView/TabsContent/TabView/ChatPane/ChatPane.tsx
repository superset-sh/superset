import { ChatServiceProvider } from "@superset/chat/client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useRef } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTabsStore } from "renderer/stores/tabs/store";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { ChatInterface } from "./ChatInterface";
import { SessionSelector } from "./components/SessionSelector";
import { createChatServiceIpcClient } from "./utils/chat-service-client";

const apiUrl = env.NEXT_PUBLIC_API_URL;

// Module-level IPC client — shared across all local workspaces
const ipcClient = createChatServiceIpcClient();

interface ChatPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	workspaceId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function ChatPane({
	paneId,
	path,
	tabId,
	workspaceId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: ChatPaneProps) {
	const pane = useTabsStore((s) => s.panes[paneId]);
	const switchChatSession = useTabsStore((s) => s.switchChatSession);
	const sessionId = pane?.chat?.sessionId ?? null;

	const { data: session } = authClient.useSession();
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);

	const organizationId = session?.session?.activeOrganizationId ?? null;
	const deviceId = deviceInfo?.deviceId ?? null;
	const collections = useCollections();

	// Check if workspace already exists remotely via Electric collection
	const { data: remoteWorkspaces } = useLiveQuery(
		(q) =>
			q
				.from({ ws: collections.workspaces })
				.where(({ ws }) => eq(ws.id, workspaceId))
				.select(({ ws }) => ({ id: ws.id })),
		[collections.workspaces, workspaceId],
	);
	const existsRemotely = remoteWorkspaces && remoteWorkspaces.length > 0;

	// Ensure remote workspace + project exist before any chat session references them
	const ensuredRef = useRef<string | null>(null);
	useEffect(() => {
		if (existsRemotely) return;
		if (!workspace?.project || !organizationId) return;
		if (ensuredRef.current === workspaceId) return;

		const project = workspace.project;
		const repoName = project.mainRepoPath.split("/").pop();
		if (!repoName || !project.githubOwner) return;

		ensuredRef.current = workspaceId;

		apiTrpcClient.workspace.ensure
			.mutate({
				organizationId,
				project: {
					name: project.name,
					slug: repoName.toLowerCase(),
					repoOwner: project.githubOwner,
					repoName,
					repoUrl: `https://github.com/${project.githubOwner}/${repoName}`,
					defaultBranch: project.defaultBranch ?? "main",
				},
				workspace: {
					id: workspaceId,
					name: workspace.name,
					type: "local",
					config: {
						path: workspace.worktreePath,
						branch:
							workspace.worktree?.branch ?? project.defaultBranch ?? "main",
					},
				},
			})
			.catch((err) => {
				console.error("[chat-pane] Failed to ensure remote workspace:", err);
				ensuredRef.current = null;
			});
	}, [existsRemotely, workspace, organizationId, workspaceId]);

	const handleSelectSession = useCallback(
		(newSessionId: string) => {
			switchChatSession(paneId, newSessionId);
		},
		[paneId, switchChatSession],
	);

	const handleNewChat = useCallback(() => {
		switchChatSession(paneId, null);
	}, [paneId, switchChatSession]);

	const handleDeleteSession = useCallback(
		async (sessionIdToDelete: string) => {
			const token = getAuthToken();
			await fetch(`${apiUrl}/api/chat/${sessionIdToDelete}/stream`, {
				method: "DELETE",
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			});

			if (sessionIdToDelete === sessionId) {
				switchChatSession(paneId, null);
			}
		},
		[sessionId, paneId, switchChatSession],
	);

	// For now all workspaces are local (IPC). When sandbox support lands,
	// cloud workspaces will use: createChatServiceHttpClient(sandboxUrl)
	const chatClient = ipcClient;

	return (
		<ChatServiceProvider client={chatClient} queryClient={electronQueryClient}>
			<BasePaneWindow
				paneId={paneId}
				path={path}
				tabId={tabId}
				splitPaneAuto={splitPaneAuto}
				removePane={removePane}
				setFocusedPane={setFocusedPane}
				renderToolbar={(handlers) => (
					<div className="flex h-full w-full items-center justify-between px-3">
						<div className="flex min-w-0 items-center gap-2">
							<SessionSelector
								currentSessionId={sessionId}
								workspaceId={workspaceId}
								onSelectSession={handleSelectSession}
								onNewChat={handleNewChat}
								onDeleteSession={handleDeleteSession}
							/>
						</div>
						<PaneToolbarActions
							splitOrientation={handlers.splitOrientation}
							onSplitPane={handlers.onSplitPane}
							onClosePane={handlers.onClosePane}
							closeHotkeyId="CLOSE_TERMINAL"
						/>
					</div>
				)}
			>
				<ChatInterface
					sessionId={sessionId}
					organizationId={organizationId}
					deviceId={deviceId}
					workspaceId={workspaceId}
					cwd={workspace?.worktreePath ?? ""}
					paneId={paneId}
					tabId={tabId}
				/>
			</BasePaneWindow>
		</ChatServiceProvider>
	);
}
