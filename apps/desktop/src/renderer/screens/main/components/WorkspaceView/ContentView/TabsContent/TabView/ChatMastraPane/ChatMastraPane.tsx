import { ChatServiceProvider } from "@superset/chat/client";
import { ChatMastraServiceProvider } from "@superset/chat-mastra/client";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { CopyIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTabsStore } from "renderer/stores/tabs/store";
import { createChatServiceIpcClient } from "../ChatPane/utils/chat-service-client";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { ChatMastraInterface } from "./ChatMastraInterface";
import type { ChatMastraRawSnapshot } from "./ChatMastraInterface/types";
import { SessionSelector } from "./components/SessionSelector";
import { createChatMastraServiceIpcClient } from "./utils/chat-mastra-service-client";
import { reportChatMastraError } from "./utils/reportChatMastraError";

const apiUrl = env.NEXT_PUBLIC_API_URL;
const mastraIpcClient = createChatMastraServiceIpcClient();
const chatIpcClient = createChatServiceIpcClient();

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
	const rawSnapshotRef = useRef<ChatMastraRawSnapshot | null>(null);
	const [rawSnapshotSessionId, setRawSnapshotSessionId] = useState<
		string | null
	>(null);
	const showDevToolbarActions = env.NODE_ENV === "development";

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

	const handleStartFreshSession = useCallback(async () => {
		if (!organizationId) {
			return {
				created: false as const,
				errorMessage: "No active organization selected",
			};
		}

		const newSessionId = crypto.randomUUID();
		try {
			await createSessionRecord({
				sessionId: newSessionId,
				organizationId,
				workspaceId,
			});
			switchChatMastraSession(paneId, newSessionId);
			return { created: true as const };
		} catch (error) {
			reportChatMastraError({
				operation: "session.create",
				error,
				sessionId: newSessionId,
				workspaceId,
				paneId,
				organizationId,
			});
			return {
				created: false as const,
				errorMessage:
					error instanceof Error
						? error.message
						: "Failed to create a new chat session",
			};
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

	const handleRawSnapshotChange = useCallback(
		(snapshot: ChatMastraRawSnapshot) => {
			rawSnapshotRef.current = snapshot;
			setRawSnapshotSessionId((previousSessionId) =>
				previousSessionId === snapshot.sessionId
					? previousSessionId
					: snapshot.sessionId,
			);
		},
		[],
	);

	const handleCopyRawSnapshot = useCallback(async () => {
		const rawSnapshot = rawSnapshotRef.current;
		if (!rawSnapshot || rawSnapshot.sessionId !== sessionId) {
			toast.error("No raw chat data to copy yet");
			return;
		}

		if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
			toast.error("Clipboard API is unavailable");
			return;
		}

		try {
			await navigator.clipboard.writeText(JSON.stringify(rawSnapshot, null, 2));
			toast.success("Copied raw chat JSON");
		} catch {
			toast.error("Failed to copy raw chat JSON");
		}
	}, [sessionId]);

	return (
		<ChatMastraServiceProvider
			client={mastraIpcClient}
			queryClient={electronQueryClient}
		>
			<ChatServiceProvider
				client={chatIpcClient}
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
								leadingActions={
									showDevToolbarActions ? (
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={() => {
														void handleCopyRawSnapshot();
													}}
													disabled={
														!rawSnapshotRef.current ||
														rawSnapshotSessionId !== sessionId
													}
													className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
												>
													<CopyIcon className="size-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="bottom" showArrow={false}>
												Copy raw chat JSON (dev)
											</TooltipContent>
										</Tooltip>
									) : null
								}
								closeHotkeyId="CLOSE_TERMINAL"
							/>
						</div>
					)}
				>
					<ChatMastraInterface
						sessionId={sessionId}
						workspaceId={workspaceId}
						cwd={workspace?.worktreePath ?? ""}
						onStartFreshSession={handleStartFreshSession}
						onRawSnapshotChange={
							showDevToolbarActions ? handleRawSnapshotChange : undefined
						}
					/>
				</BasePaneWindow>
			</ChatServiceProvider>
		</ChatMastraServiceProvider>
	);
}
