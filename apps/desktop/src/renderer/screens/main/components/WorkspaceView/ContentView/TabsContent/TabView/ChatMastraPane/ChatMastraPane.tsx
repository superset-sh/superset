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
import { posthog } from "renderer/lib/posthog";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { TabContentContextMenu } from "../../TabContentContextMenu";
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
	splitPaneHorizontal: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;
	splitPaneVertical: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	availableTabs: Tab[];
	onMoveToTab: (targetTabId: string) => void;
	onMoveToNewTab: () => void;
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

const SESSION_INIT_RETRY_DELAY_MS = 1500;
const SESSION_INIT_MAX_RETRIES = 3;

export function ChatMastraPane({
	paneId,
	path,
	tabId,
	workspaceId,
	splitPaneAuto,
	splitPaneHorizontal,
	splitPaneVertical,
	removePane,
	setFocusedPane,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
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
	const hasCurrentSessionRecord = Boolean(
		sessionId && sessions.some((item) => item.id === sessionId),
	);
	const [isSessionInitializing, setIsSessionInitializing] = useState(false);
	const [sessionInitRetryToken, setSessionInitRetryToken] = useState(0);
	const sessionInitRetryCountRef = useRef(0);
	const sessionInitRetryTimeoutRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);
	const ensureSessionRecordRef = useRef<string | null>(null);
	const sessionInitScopeRef = useRef<string | null>(null);

	useEffect(() => {
		return () => {
			if (sessionInitRetryTimeoutRef.current) {
				clearTimeout(sessionInitRetryTimeoutRef.current);
				sessionInitRetryTimeoutRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		const scope = `${organizationId ?? "none"}:${workspaceId}:${sessionId ?? "none"}`;
		if (sessionInitScopeRef.current === scope) return;
		sessionInitScopeRef.current = scope;
		sessionInitRetryCountRef.current = 0;
		ensureSessionRecordRef.current = null;
		setIsSessionInitializing(false);
		if (sessionInitRetryTimeoutRef.current) {
			clearTimeout(sessionInitRetryTimeoutRef.current);
			sessionInitRetryTimeoutRef.current = null;
		}
	}, [organizationId, sessionId, workspaceId]);

	const handleSelectSession = useCallback(
		(nextSessionId: string) => {
			switchChatMastraSession(paneId, nextSessionId);
			posthog.capture("chat_session_opened", {
				workspace_id: workspaceId,
				session_id: nextSessionId,
				organization_id: organizationId,
			});
		},
		[organizationId, paneId, switchChatMastraSession, workspaceId],
	);

	const createAndActivateSession = useCallback(
		async ({
			targetOrganizationId,
			newSessionId,
		}: {
			targetOrganizationId: string;
			newSessionId: string;
		}) => {
			try {
				await createSessionRecord({
					sessionId: newSessionId,
					organizationId: targetOrganizationId,
					workspaceId,
				});
				switchChatMastraSession(paneId, newSessionId);
				posthog.capture("chat_session_created", {
					workspace_id: workspaceId,
					session_id: newSessionId,
					organization_id: targetOrganizationId,
				});
				return { created: true as const, sessionId: newSessionId };
			} catch (error) {
				reportChatMastraError({
					operation: "session.create",
					error,
					sessionId: newSessionId,
					workspaceId,
					paneId,
					organizationId: targetOrganizationId,
				});
				return {
					created: false as const,
					errorMessage:
						error instanceof Error
							? error.message
							: "Failed to create a new chat session",
				};
			}
		},
		[paneId, switchChatMastraSession, workspaceId],
	);

	const handleNewChat = useCallback(async () => {
		if (!organizationId) return;
		const createResult = await createAndActivateSession({
			targetOrganizationId: organizationId,
			newSessionId: crypto.randomUUID(),
		});
		if (!createResult.created) {
			toast.error("Failed to create session");
		}
	}, [createAndActivateSession, organizationId]);

	const handleStartFreshSession = useCallback(async () => {
		if (!organizationId) {
			return {
				created: false as const,
				errorMessage: "No active organization selected",
			};
		}
		return createAndActivateSession({
			targetOrganizationId: organizationId,
			newSessionId: crypto.randomUUID(),
		});
	}, [createAndActivateSession, organizationId]);

	const handleDeleteSession = useCallback(
		async (sessionIdToDelete: string) => {
			try {
				await deleteSessionRecord(sessionIdToDelete);
				posthog.capture("chat_session_deleted", {
					workspace_id: workspaceId,
					session_id: sessionIdToDelete,
					organization_id: organizationId,
				});
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

	const ensureCurrentSessionRecord = useCallback(async (): Promise<boolean> => {
		if (!sessionId || !organizationId) return false;
		if (hasCurrentSessionRecord) return true;

		const ensureKey = `${organizationId}:${workspaceId}:${sessionId}:manual`;
		ensureSessionRecordRef.current = ensureKey;
		setIsSessionInitializing(true);

		try {
			await createSessionRecord({
				sessionId,
				organizationId,
				workspaceId,
			});
			if (ensureSessionRecordRef.current !== ensureKey) return false;
			sessionInitRetryCountRef.current = 0;
			setIsSessionInitializing(false);
			return true;
		} catch (error) {
			if (ensureSessionRecordRef.current !== ensureKey) return false;
			reportChatMastraError({
				operation: "session.create",
				error,
				sessionId,
				workspaceId,
				paneId,
				organizationId,
			});
			ensureSessionRecordRef.current = null;
			setIsSessionInitializing(false);
			return false;
		}
	}, [hasCurrentSessionRecord, organizationId, paneId, sessionId, workspaceId]);

	useEffect(() => {
		if (!sessionId || !organizationId) return;
		if (hasCurrentSessionRecord) {
			sessionInitRetryCountRef.current = 0;
			if (sessionInitRetryTimeoutRef.current) {
				clearTimeout(sessionInitRetryTimeoutRef.current);
				sessionInitRetryTimeoutRef.current = null;
			}
			ensureSessionRecordRef.current = null;
			setIsSessionInitializing(false);
			return;
		}

		const ensureKey = `${organizationId}:${workspaceId}:${sessionId}:${sessionInitRetryToken}`;
		if (ensureSessionRecordRef.current === ensureKey) return;
		ensureSessionRecordRef.current = ensureKey;
		setIsSessionInitializing(true);

		void createSessionRecord({
			sessionId,
			organizationId,
			workspaceId,
		})
			.then(() => {
				if (ensureSessionRecordRef.current !== ensureKey) return;
				sessionInitRetryCountRef.current = 0;
				setIsSessionInitializing(false);
			})
			.catch((error) => {
				if (ensureSessionRecordRef.current !== ensureKey) return;
				reportChatMastraError({
					operation: "session.create",
					error,
					sessionId,
					workspaceId,
					paneId,
					organizationId,
				});
				ensureSessionRecordRef.current = null;
				const nextRetry = sessionInitRetryCountRef.current + 1;
				sessionInitRetryCountRef.current = nextRetry;
				if (nextRetry <= SESSION_INIT_MAX_RETRIES) {
					sessionInitRetryTimeoutRef.current = setTimeout(() => {
						sessionInitRetryTimeoutRef.current = null;
						setSessionInitRetryToken((token) => token + 1);
					}, SESSION_INIT_RETRY_DELAY_MS);
					return;
				}
				setIsSessionInitializing(false);
				toast.error("Failed to initialize chat session");
			});
	}, [
		hasCurrentSessionRecord,
		organizationId,
		paneId,
		sessionId,
		sessionInitRetryToken,
		workspaceId,
	]);

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
									isSessionInitializing={isSessionInitializing}
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
					<TabContentContextMenu
						onSplitHorizontal={() => splitPaneHorizontal(tabId, paneId, path)}
						onSplitVertical={() => splitPaneVertical(tabId, paneId, path)}
						onClosePane={() => removePane(paneId)}
						currentTabId={tabId}
						availableTabs={availableTabs}
						onMoveToTab={onMoveToTab}
						onMoveToNewTab={onMoveToNewTab}
						closeLabel="Close Chat"
					>
						<div className="h-full w-full">
							<ChatMastraInterface
								sessionId={sessionId}
								workspaceId={workspaceId}
								organizationId={organizationId}
								cwd={workspace?.worktreePath ?? ""}
								isSessionReady={hasCurrentSessionRecord}
								ensureSessionReady={ensureCurrentSessionRecord}
								onStartFreshSession={handleStartFreshSession}
								onRawSnapshotChange={
									showDevToolbarActions ? handleRawSnapshotChange : undefined
								}
							/>
						</div>
					</TabContentContextMenu>
				</BasePaneWindow>
			</ChatServiceProvider>
		</ChatMastraServiceProvider>
	);
}
