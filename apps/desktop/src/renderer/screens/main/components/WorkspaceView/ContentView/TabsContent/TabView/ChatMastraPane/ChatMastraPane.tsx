import { ChatMastraServiceProvider } from "@superset/chat-mastra/client";
import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTabsStore } from "renderer/stores/tabs/store";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { ChatMastraInterface } from "./ChatMastraInterface";
import { SessionSelector } from "./components/SessionSelector";
import { createChatMastraServiceIpcClient } from "./utils/chat-mastra-service-client";
import { reportChatMastraError } from "./utils/reportChatMastraError";

const apiUrl = env.NEXT_PUBLIC_API_URL;
const mastraIpcClient = createChatMastraServiceIpcClient();

interface ChatMastraPaneProps {
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

function toSessionSelectorItem(session: {
	id: string;
	title: string | null;
	lastActiveAt: Date | string | null;
	createdAt: Date | string;
}) {
	return {
		sessionId: session.id,
		title: session.title ?? "",
		updatedAt:
			session.lastActiveAt instanceof Date
				? session.lastActiveAt
				: session.lastActiveAt
					? new Date(session.lastActiveAt)
					: session.createdAt instanceof Date
						? session.createdAt
						: new Date(session.createdAt),
	};
}

async function getHttpErrorDetail(response: Response): Promise<string> {
	const errorBody = await response
		.text()
		.then((text) => text.trim())
		.catch(() => "");
	const statusText = response.statusText ? ` ${response.statusText}` : "";
	const detail = errorBody ? ` - ${errorBody.slice(0, 500)}` : "";
	return `${response.status}${statusText}${detail}`;
}

async function createSessionRecord(input: {
	sessionId: string;
	organizationId: string;
	workspaceId: string;
}): Promise<void> {
	const token = getAuthToken();
	const response = await fetch(`${apiUrl}/api/chat/${input.sessionId}`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({
			organizationId: input.organizationId,
			workspaceId: input.workspaceId,
		}),
	});

	if (!response.ok) {
		const detail = await getHttpErrorDetail(response);
		throw new Error(`Failed to create session ${input.sessionId}: ${detail}`);
	}
}

async function deleteSessionRecord(sessionId: string): Promise<void> {
	const token = getAuthToken();
	const response = await fetch(`${apiUrl}/api/chat/${sessionId}/stream`, {
		method: "DELETE",
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});

	if (!response.ok) {
		const detail = await getHttpErrorDetail(response);
		throw new Error(`Failed to delete session ${sessionId}: ${detail}`);
	}
}

export function ChatMastraPane({
	paneId,
	path,
	tabId,
	workspaceId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: ChatMastraPaneProps) {
	const pane = useTabsStore((state) => state.panes[paneId]);
	const switchChatMastraSession = useTabsStore(
		(state) => state.switchChatMastraSession,
	);
	const sessionId = pane?.chatMastra?.sessionId ?? null;
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const collections = useCollections();
	const ensureSessionRef = useRef(false);
	const ensuredRef = useRef<string | null>(null);

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: Boolean(workspaceId) },
	);

	const { data: remoteWorkspaces } = useLiveQuery(
		(q) =>
			q
				.from({ ws: collections.workspaces })
				.where(({ ws }) => eq(ws.id, workspaceId))
				.select(({ ws }) => ({ id: ws.id })),
		[collections.workspaces, workspaceId],
	);
	const existsRemotely = Boolean(
		remoteWorkspaces && remoteWorkspaces.length > 0,
	);

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
			.catch((error) => {
				reportChatMastraError({
					operation: "workspace.ensure",
					error,
					workspaceId,
					paneId,
					organizationId,
				});
				ensuredRef.current = null;
			});
	}, [existsRemotely, organizationId, paneId, workspace, workspaceId]);

	const { data: sessionsData } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) => eq(chatSessions.workspaceId, workspaceId))
				.orderBy(({ chatSessions }) => chatSessions.lastActiveAt, "desc")
				.select(({ chatSessions }) => ({ ...chatSessions })),
		[collections.chatSessions, workspaceId],
	);
	const sessions = sessionsData ?? [];

	const handleSelectSession = useCallback(
		(nextSessionId: string) => {
			switchChatMastraSession(paneId, nextSessionId);
		},
		[paneId, switchChatMastraSession],
	);

	const handleNewChat = useCallback(async () => {
		if (!organizationId) return;
		const newSessionId = crypto.randomUUID();
		try {
			await createSessionRecord({
				sessionId: newSessionId,
				organizationId,
				workspaceId,
			});
			switchChatMastraSession(paneId, newSessionId);
		} catch (error) {
			reportChatMastraError({
				operation: "session.create",
				error,
				sessionId: newSessionId,
				workspaceId,
				paneId,
				organizationId,
			});
			toast.error("Failed to create session");
		}
	}, [organizationId, paneId, switchChatMastraSession, workspaceId]);

	const handleDeleteSession = useCallback(
		async (sessionIdToDelete: string) => {
			try {
				await deleteSessionRecord(sessionIdToDelete);
				if (sessionIdToDelete === sessionId) {
					switchChatMastraSession(paneId, null);
				}
			} catch (error) {
				reportChatMastraError({
					operation: "session.delete",
					error,
					sessionId: sessionIdToDelete,
					workspaceId,
					paneId,
					organizationId,
				});
				throw error;
			}
		},
		[organizationId, paneId, sessionId, switchChatMastraSession, workspaceId],
	);

	useEffect(() => {
		if (sessionId) return;
		if (!organizationId) return;
		if (ensureSessionRef.current) return;
		ensureSessionRef.current = true;

		void handleNewChat()
			.catch(() => {})
			.finally(() => {
				ensureSessionRef.current = false;
			});
	}, [handleNewChat, organizationId, sessionId]);

	const sessionItems = useMemo(
		() => sessions.map((item) => toSessionSelectorItem(item)),
		[sessions],
	);

	return (
		<ChatMastraServiceProvider
			client={mastraIpcClient}
			queryClient={electronQueryClient}
		>
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
								sessions={sessionItems}
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
				<ChatMastraInterface
					sessionId={sessionId}
					workspaceId={workspaceId}
					cwd={workspace?.worktreePath ?? ""}
				/>
			</BasePaneWindow>
		</ChatMastraServiceProvider>
	);
}
