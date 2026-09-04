import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type {
	ComposerHandle,
	ComposerQuickKeysAction,
	ComposerSessionTab,
} from "@superset/composer";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
	CloudOff,
	Plus,
	SquareTerminal,
	TriangleAlert,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Keyboard,
	LayoutAnimation,
	Pressable,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { getHostWorkspacesQueryKey } from "@/hooks/useHostWorkspaces";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { posthog } from "@/lib/posthog";
import {
	getHostTerminalsQueryKey,
	useHostTerminals,
} from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { HeaderNotice } from "@/screens/(authenticated)/components/HeaderNotice";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { useAgentIconUris } from "@/screens/(authenticated)/hooks/useAgentIconUris";
import { useAppReviewPrompt } from "@/screens/(authenticated)/hooks/useAppReviewPrompt";
import { useCreateTerminalWorkspace } from "@/screens/(authenticated)/hooks/useCreateTerminalWorkspace";
import { useSlashCommands } from "@/screens/(authenticated)/hooks/useSlashCommands";
import { usePendingWorkspaceCreatesStore } from "@/screens/(authenticated)/stores/pendingWorkspaceCreatesStore";
import { useTerminalSeenStore } from "@/screens/(authenticated)/stores/terminalSeenStore";
import { useTerminalTabOrderStore } from "@/screens/(authenticated)/stores/terminalTabOrderStore";
import { useUnreadWorkspacesStore } from "@/screens/(authenticated)/stores/unreadWorkspacesStore";
import { CloudWorkspaceProvisioningState } from "../components/CloudWorkspaceProvisioningState";
import { ScrollToBottomButton } from "../components/ScrollToBottomButton";
import {
	TerminalComposer,
	type TerminalQuickKey,
} from "../components/TerminalComposer";
import {
	type TerminalConnectionState,
	type TerminalControlMessage,
	type TerminalSelectState,
	TerminalWebView,
	type TerminalWebViewHandle,
} from "../components/TerminalWebView";
import { useHostCompatibility } from "../hooks/useHostCompatibility";
import { usePullRequestIconUri } from "../hooks/usePullRequestIconUri";
import { useWorkspacePullRequests } from "../hooks/useWorkspacePullRequest";
import { orderTerminalRows } from "../utils/orderTerminalRows";
import { PULL_REQUEST_SYMBOL, pullRequestStatus } from "../utils/pullRequest";
import { WorkspaceCreateFailedState } from "./components/WorkspaceCreateFailedState";
import { WorkspaceCreatingState } from "./components/WorkspaceCreatingState";
import { WorkspacePlaceholder } from "./components/WorkspacePlaceholder";

const NOTICE_MS = 1500;

// No fullScreenGestureEnabled: false here. On iOS 26 the system's back swipe
// IS the full-screen one, and react-native-screens reads that flag as "no back
// gesture at all" rather than "edge only" — the old edge recognizer is gone.
const headerOptions = {
	headerShown: true,
	headerBackButtonDisplayMode: "minimal",
	headerShadowVisible: false,
} as const;

const PENDING_CREATE_POLL_MS = 2_000;
/** Worktree add + base fetch on monorepo-scale repos; failed state past this. */
const PENDING_CREATE_ROW_TIMEOUT_MS = 5 * 60_000;
/** The row landed but the launched agent never produced a session. */
const PENDING_CREATE_SESSION_TIMEOUT_MS = 60_000;

const STATE_BANNERS: Partial<
	Record<TerminalConnectionState, MessageDescriptor>
> = {
	connecting: msg({ message: "Connecting…" }),
	reconnecting: msg({
		message: "Reconnecting…",
	}),
	denied: msg({
		message: "You don't have access to this terminal.",
	}),
};

/**
 * The workspace IS the terminal: sessions render as tabs (agent mark + name),
 * the active tab is the one live attached stream, and the + menu launches a
 * new session from the host's agent presets (or a plain shell). Chrome: the
 * compact header (name → action sheet) and the terminal composer, whose
 * quick-key row also carries this workspace's pull requests.
 *
 * The tab strip is drawn by the composer rather than here. It sits directly
 * above the quick keys, inside the composer's own view tree, because its
 * position depends on the composer's height — as a sibling it would have to
 * guess a number that only exists on the other side of the bridge, which is the
 * drift `ComposerQuickKeys` was moved native to fix. This screen still owns
 * every decision: which session is attached, what closing one costs, the order
 * they sit in.
 */
export function WorkspaceScreen() {
	const { t } = useLingui();
	const params = useLocalSearchParams<{ id: string; tab?: string }>();
	const id = params.id;
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const queryClient = useQueryClient();

	const { workspace, host, cloud, isResolving } = useWorkspaceHost(id ?? null);
	const { terminalsByWorkspace, isReady } = useHostTerminals(host);
	const pullRequests = useWorkspacePullRequests(id ?? null);

	// Tabs hold the arrangement the user dragged in the sessions sheet, falling
	// back to creation order — the hook's activity sort is right for home rows
	// but makes tabs swap places under the user whenever relative activity
	// changes.
	const savedOrder = useTerminalTabOrderStore((state) =>
		id ? state.orderByWorkspace[id] : undefined,
	);
	const rows = useMemo(
		() =>
			orderTerminalRows(
				id ? (terminalsByWorkspace.get(id) ?? []) : [],
				savedOrder,
			),
		[terminalsByWorkspace, id, savedOrder],
	);

	// Active tab: the deep-linked ?tab= until the user switches, else the
	// first session. Falls back gracefully when the active terminal dies.
	const [pickedTerminalId, setPickedTerminalId] = useState<string | null>(null);
	const activeTerminalId = useMemo(() => {
		for (const candidate of [pickedTerminalId, params.tab]) {
			if (candidate && rows.some((row) => row.terminalId === candidate)) {
				return candidate;
			}
		}
		return rows[0]?.terminalId ?? null;
	}, [pickedTerminalId, params.tab, rows]);

	// --- pending create (enqueued via `workspaces.createEnqueued`) ---
	// The settled event only exists on the desktop's event bus, so poll the
	// creating host until the row and its first session appear.
	const pendingCreate = usePendingWorkspaceCreatesStore((state) =>
		id ? state.pendingById[id] : undefined,
	);
	const clearPendingCreate = usePendingWorkspaceCreatesStore(
		(state) => state.clear,
	);
	const failPendingCreate = usePendingWorkspaceCreatesStore(
		(state) => state.fail,
	);
	const createWorkspace = useCreateTerminalWorkspace();
	const isCreating =
		!!pendingCreate && !pendingCreate.error && rows.length === 0;
	const workspaceResolved = workspace !== null;
	const createFailed =
		!!pendingCreate?.error && !workspaceResolved && rows.length === 0;

	// Poll through the failed state too: a relay timeout can reject a create
	// the host actually finished, and the row arriving is what heals it.
	const pollingActive = isCreating || createFailed;
	useEffect(() => {
		if (!pollingActive || !pendingCreate) return;
		const interval = setInterval(() => {
			void queryClient.invalidateQueries({
				queryKey: getHostWorkspacesQueryKey(
					pendingCreate.hostId,
					pendingCreate.hostUrl,
				),
			});
			void queryClient.invalidateQueries({
				queryKey: getHostTerminalsQueryKey(pendingCreate.hostId),
			});
		}, PENDING_CREATE_POLL_MS);
		return () => clearInterval(interval);
	}, [pollingActive, pendingCreate, queryClient]);

	// The launched session arrived — the create is done for this screen.
	useEffect(() => {
		if (pendingCreate && !pendingCreate.error && rows.length > 0) {
			clearPendingCreate(pendingCreate.workspaceId);
		}
	}, [pendingCreate, rows.length, clearPendingCreate]);

	// The create "failed" but the workspace actually exists (e.g. a legacy
	// synchronous create that timed out at the relay while the host finished
	// anyway) — the real workspace wins over the failed state.
	useEffect(() => {
		if (pendingCreate?.error && workspaceResolved) {
			clearPendingCreate(pendingCreate.workspaceId);
		}
	}, [pendingCreate, workspaceResolved, clearPendingCreate]);

	// No row within the backstop: the create died host-side and there is no
	// event channel to say so. Resolve to the failed state rather than spin.
	useEffect(() => {
		if (!pendingCreate || pendingCreate.error || workspaceResolved) return;
		const workspaceId = pendingCreate.workspaceId;
		const remaining = Math.max(
			0,
			pendingCreate.startedAt + PENDING_CREATE_ROW_TIMEOUT_MS - Date.now(),
		);
		const timer = setTimeout(() => {
			failPendingCreate(
				workspaceId,
				t({
					message: "Timed out waiting for the host to create the workspace.",
				}),
			);
		}, remaining);
		return () => clearTimeout(timer);
	}, [pendingCreate, workspaceResolved, failPendingCreate, t]);

	// Row landed but no session followed (agent failed to launch): fall
	// through to the regular empty state instead of spinning.
	useEffect(() => {
		if (!pendingCreate || pendingCreate.error || !workspaceResolved) return;
		const workspaceId = pendingCreate.workspaceId;
		const timer = setTimeout(
			() => clearPendingCreate(workspaceId),
			PENDING_CREATE_SESSION_TIMEOUT_MS,
		);
		return () => clearTimeout(timer);
	}, [pendingCreate, workspaceResolved, clearPendingCreate]);

	// Retry mints a fresh id and re-enters Creating via replace, so back
	// never returns to the dead failed state (desktop's `replace: true`).
	const retryCreate = useCallback(() => {
		if (!pendingCreate) return;
		clearPendingCreate(pendingCreate.workspaceId);
		createWorkspace.mutate({ ...pendingCreate.input, replace: true });
	}, [pendingCreate, clearPendingCreate, createWorkspace]);

	const dismissFailedCreate = useCallback(() => {
		if (pendingCreate) clearPendingCreate(pendingCreate.workspaceId);
		router.back();
	}, [pendingCreate, clearPendingCreate, router]);

	const hostUrl = host
		? hostServiceUrl(host.organizationId, host.machineId)
		: null;
	const hostCompatibility = useHostCompatibility(hostUrl);

	useEffect(() => {
		if (!id) return;
		posthog.capture("workspace_opened", {
			workspace_id: id,
			source: router.canGoBack() ? "list" : "deeplink",
		});
	}, [id, router]);

	// The + sheet lands back here via dismissTo with the new session in
	// ?tab= — adopt it once its row arrives, since the terminals query hasn't
	// heard of the session when the sheet closes. Otherwise pin whatever ended
	// up active, including the implicit first row: without the pin, reordering
	// in the sessions sheet moves a different row into first place and the
	// terminal you're watching switches out from under you. One effect, so the
	// adoption outranks the pin — as separate effects the pin re-asserted the
	// old tab in the same commit the fresh row arrived, and the new session
	// never activated.
	const adoptedTabRef = useRef<string | null>(null);
	// A manual pick while the ?tab= row is still pending consumes the
	// adoption — the arriving row must not yank the user off their choice.
	const pickTerminal = useCallback(
		(terminalId: string) => {
			adoptedTabRef.current = params.tab ?? null;
			setPickedTerminalId(terminalId);
			if (terminalId !== activeTerminalId) {
				posthog.capture("session_switched", {
					workspace_id: id ?? null,
					source: "tab_strip",
				});
			}
		},
		[params.tab, activeTerminalId, id],
	);
	useEffect(() => {
		if (
			params.tab &&
			adoptedTabRef.current !== params.tab &&
			rows.some((row) => row.terminalId === params.tab)
		) {
			adoptedTabRef.current = params.tab;
			setPickedTerminalId(params.tab);
			return;
		}
		if (activeTerminalId) setPickedTerminalId(activeTerminalId);
	}, [params.tab, rows, activeTerminalId]);

	// Opening the workspace reads it, the way clicking a desktop sidebar row
	// does — the mark is only there to bring you back here.
	const clearManualUnread = useUnreadWorkspacesStore(
		(state) => state.clearManualUnread,
	);
	useEffect(() => {
		if (id) clearManualUnread(id);
	}, [id, clearManualUnread]);

	// Port of desktop's useClearActivePaneAttention: viewing the tab clears
	// its `review` state by advancing the seen mark to the binding's last
	// event (host clock — never the device clock).
	const markTerminalSeen = useTerminalSeenStore(
		(state) => state.markTerminalSeen,
	);
	const requestAppReview = useAppReviewPrompt();
	const activeRow = rows.find((row) => row.terminalId === activeTerminalId);
	const slashCommands = useSlashCommands({
		machineId: host?.machineId ?? null,
		hostUrl,
		workspaceId: id ?? null,
		agent: activeRow?.definitionId ?? activeRow?.agentId ?? null,
	});
	useEffect(() => {
		if (activeRow?.attention !== "review") return;
		if (activeRow.lastEventAt === null) return;
		markTerminalSeen(activeRow.terminalId, activeRow.lastEventAt);
		requestAppReview("session_completed");
	}, [activeRow, markTerminalSeen, requestAppReview]);

	// Brand marks as file URIs: the composer draws them, and neither SwiftUI nor
	// the bridge can read a Metro asset reference.
	const agentIds = useMemo(() => rows.map((row) => row.agentId), [rows]);
	const agentIconUris = useAgentIconUris(agentIds);
	const sessionTabs = useMemo<ComposerSessionTab[]>(
		() =>
			rows.map((row) => ({
				id: row.terminalId,
				label: row.title,
				iconUri: row.agentId ? agentIconUris[row.agentId] : undefined,
				selected: row.terminalId === activeTerminalId,
				attention: row.attention ?? undefined,
			})),
		[rows, activeTerminalId, agentIconUris],
	);

	const invalidateTerminals = useCallback(() => {
		if (!host) return;
		void queryClient.invalidateQueries({
			queryKey: getHostTerminalsQueryKey(host.machineId),
		});
	}, [host, queryClient]);

	const [refreshing, setRefreshing] = useState(false);
	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await queryClient
			.refetchQueries({ queryKey: ["host-service", "workspaces", "list"] })
			.catch(() => {});
		invalidateTerminals();
		void queryClient.invalidateQueries({ queryKey: ["cloud"] });
		setRefreshing(false);
	}, [queryClient, invalidateTerminals]);

	const openAddMenu = useCallback(() => {
		router.push(`/(authenticated)/workspace/${id}/new-session`);
	}, [router, id]);

	const openSessions = useCallback(() => {
		router.push(
			`/(authenticated)/workspace/${id}/sessions?active=${activeTerminalId ?? ""}`,
		);
	}, [router, id, activeTerminalId]);

	const killTerminal = useCallback(
		(terminalId: string) => {
			if (!workspace || !hostUrl) return;
			void getHostServiceClientByUrl(hostUrl)
				.terminal.killSession.mutate({ terminalId, workspaceId: workspace.id })
				// A kill that fails leaves the tab exactly where it was, which reads
				// as the tap having missed. Cheap to ignore while closing was a
				// long-press only; the strip now offers it on every selected tab and
				// in the press-and-hold menu, so silence is no longer affordable.
				.catch((cause: unknown) =>
					Alert.alert(
						t({
							message: "Could not close the session",
						}),
						errorMessage(cause),
					),
				)
				.finally(invalidateTerminals);
		},
		[workspace, hostUrl, invalidateTerminals, t],
	);

	// The composer reports the intent and stops there: it has no idea that
	// closing a tab kills an agent mid-task, so the confirm lives here. Reached
	// from the selected tab's close disc and from its press-and-hold menu.
	const confirmCloseTerminal = useCallback(
		(terminalId: string) => {
			const row = rows.find((candidate) => candidate.terminalId === terminalId);
			Alert.alert(
				t({
					message: "Close session",
				}),
				row?.title,
				[
					{
						text: t({ message: "Cancel" }),
						style: "cancel",
					},
					{
						text: t({ message: "Close" }),
						style: "destructive",
						onPress: () => killTerminal(terminalId),
					},
				],
			);
		},
		[rows, killTerminal, t],
	);

	// --- active terminal connection (one live stream; tabs switch it) ---
	const terminalRef = useRef<TerminalWebViewHandle>(null);
	const [connectionState, setConnectionState] =
		useState<TerminalConnectionState>("connecting");
	// Reported by the composer itself: it draws in an overlay and takes no
	// layout space here, so nothing below can measure it.
	const [composerHeight, setComposerHeight] = useState(0);
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const [composerActive, setComposerActive] = useState(false);
	const composerRef = useRef<ComposerHandle>(null);
	const [select, setSelect] = useState<TerminalSelectState>({
		active: false,
		hasSelection: false,
	});
	const [atBottom, setAtBottom] = useState(true);
	// seq gives each notice its own identity: a repeat copy while "Copied" is
	// still up remounts HeaderNotice, restarting its timer.
	const [notice, setNotice] = useState<{ text: string; seq: number } | null>(
		null,
	);
	const hideNotice = useCallback(() => setNotice(null), []);
	const composerActiveRef = useRef(false);
	composerActiveRef.current = composerActive;
	const handleTerminalTap = useCallback(() => {
		if (composerActiveRef.current) composerRef.current?.blur();
	}, []);
	const handleCopied = useCallback(
		() =>
			setNotice((prev) => ({
				text: t({ message: "Copied" }),
				seq: (prev?.seq ?? 0) + 1,
			})),
		[t],
	);

	// Press and hold a tab → Copy session ID. The pasteboard write lands here
	// rather than natively so it shares the header notice every other copy on
	// this screen already uses.
	const copyTerminalId = useCallback(
		(terminalId: string) => {
			void Clipboard.setStringAsync(terminalId).then(handleCopied);
			posthog.capture("session_id_copied", { workspace_id: id ?? null });
		},
		[handleCopied, id],
	);

	useEffect(() => {
		const show = Keyboard.addListener("keyboardWillShow", (event) => {
			LayoutAnimation.configureNext({
				duration: event.duration || 250,
				update: { type: LayoutAnimation.Types.keyboard },
			});
			setKeyboardHeight(event.endCoordinates.height);
		});
		const hide = Keyboard.addListener("keyboardWillHide", (event) => {
			LayoutAnimation.configureNext({
				duration: event.duration || 250,
				update: { type: LayoutAnimation.Types.keyboard },
			});
			setKeyboardHeight(0);
		});
		return () => {
			show.remove();
			hide.remove();
		};
	}, []);

	const composerBottom = keyboardHeight > 0 ? keyboardHeight : insets.bottom;

	const handleControl = useCallback(
		(message: TerminalControlMessage) => {
			// Session ended under us — refresh the tab row; the active tab falls
			// back to the next session automatically.
			if (message.type === "exit") invalidateTerminals();
		},
		[invalidateTerminals],
	);

	// Submits go through the host's terminal.send instead of the attached
	// stream. An Enter written together with the text arrives in the same read,
	// and a TUI agent takes that burst for a paste — the message lands in the
	// draft with a newline appended instead of being submitted (#6284). The host
	// separates and delays the Enter, and frames the text as a bracketed paste
	// only when the running program actually has that mode on.
	const handleSubmit = useCallback(
		async (text: string) => {
			if (!hostUrl || !activeTerminalId || !id) {
				throw new Error("Terminal is not connected");
			}
			await getHostServiceClientByUrl(hostUrl).terminal.send.mutate({
				terminalId: activeTerminalId,
				workspaceId: id,
				text,
			});
		},
		[hostUrl, activeTerminalId, id],
	);

	const handleQuickKey = useCallback(
		(key: TerminalQuickKey) => {
			if (key.submits) {
				void handleSubmit("").catch(() => undefined);
				return;
			}
			if (key.data) terminalRef.current?.sendInput(key.data);
		},
		[handleSubmit],
	);

	useEffect(() => {
		if (connectionState !== "error" && connectionState !== "denied") return;
		posthog.capture("terminal_connect_failed", {
			workspace_id: id ?? null,
			terminal_id: activeTerminalId,
			category: connectionState,
		});
	}, [connectionState, id, activeTerminalId]);

	const bannerDescriptor = STATE_BANNERS[connectionState];
	const banner = bannerDescriptor ? i18n._(bannerDescriptor) : undefined;
	const showComposer =
		activeTerminalId !== null &&
		host !== null &&
		!hostCompatibility.incompatible;

	const attachmentTarget = useMemo(
		() =>
			id && hostUrl && workspace?.worktreePath
				? { workspaceId: id, hostUrl, worktreePath: workspace.worktreePath }
				: null,
		[id, hostUrl, workspace],
	);

	// The chip beside the quick keys, or nothing. Mark and colour both come off
	// the newest pull request, the way the pill this replaced did.
	const pullRequestStatusNow = pullRequests[0]
		? pullRequestStatus(pullRequests[0])
		: null;
	const pullRequestIconUri = usePullRequestIconUri(pullRequestStatusNow);
	const pullRequestAction = useMemo((): ComposerQuickKeysAction | undefined => {
		const latest = pullRequests[0];
		if (!latest) return undefined;
		const status = pullRequestStatus(latest);
		// Named, not `pullRequests.length` inline: the macro takes the
		// placeholder's name from the expression, and a member access would
		// rewrite the catalog's {count} to {0} and strand every translation.
		const count = pullRequests.length;
		return {
			symbol: PULL_REQUEST_SYMBOL[status],
			iconUri: pullRequestIconUri ?? undefined,
			tint: status,
			label:
				count === 1
					? t({
							message: "View pull request",
						})
					: t({
							message: `View ${count} pull requests`,
						}),
		};
	}, [pullRequests, pullRequestIconUri, t]);

	// One PR goes straight to it; a history goes to the list. Captured by hand
	// because the tap lands in SwiftUI, where RN autocapture cannot see it.
	const openPullRequests = useCallback(() => {
		posthog.capture("pull_requests_opened", {
			workspace_id: id ?? null,
			count: pullRequests.length,
		});
		if (pullRequests.length > 1) {
			router.push({
				pathname: "/workspace/[id]/pull-requests",
				params: { id },
			});
			return;
		}
		router.push({
			pathname: "/workspace/[id]/pull-request/[pullRequestId]",
			params: { id, pullRequestId: String(pullRequests[0]?.prNumber ?? "") },
		});
	}, [id, pullRequests, router]);

	// Full-body takeover while the enqueued create is unresolved — the
	// mobile equivalent of desktop's layout gate: same route, no navigation,
	// and none of the chrome that assumes a workspace exists (tab strip,
	// composer, sheets). The native header stays so back keeps working.
	if ((isCreating || createFailed) && pendingCreate) {
		const { projectName } = pendingCreate.input.target;
		const subtitle = pendingCreate.input.branchLabel
			? `${projectName} · ${pendingCreate.input.branchLabel}`
			: projectName;
		return (
			<View className="bg-background flex-1">
				<Stack.Screen
					options={{
						...headerOptions,
						title: t({
							message: "New workspace",
						}),
					}}
				/>
				{createFailed ? (
					<WorkspaceCreateFailedState
						subtitle={subtitle}
						errorMessage={pendingCreate.error ?? ""}
						prompt={pendingCreate.input.message.text.trim()}
						onRetry={retryCreate}
						onDismiss={dismissFailedCreate}
					/>
				) : (
					<WorkspaceCreatingState
						subtitle={subtitle}
						agentLabel={pendingCreate.input.agentLabel}
						startedAt={pendingCreate.startedAt}
						workspaceResolved={workspaceResolved}
						onBackHome={() => router.back()}
					/>
				)}
			</View>
		);
	}

	return (
		<View className="bg-background flex-1">
			<Stack.Screen
				options={{
					...headerOptions,
					title: t({ message: "Workspace" }),
					headerTitle: notice
						? () => (
								<HeaderNotice
									key={notice.seq}
									onHidden={hideNotice}
									text={notice.text}
									visibleFor={NOTICE_MS}
								/>
							)
						: undefined,
				}}
			>
				{notice ? null : (
					<Stack.Title asChild>
						<PressableScale
							onPress={() =>
								router.push(`/(authenticated)/workspace/${id}/actions`)
							}
							disabled={!workspace}
						>
							{/* Width budget: the back capsule leaves ~210pt of bar on a 390pt
							    screen — wider and the title collides with the back button under
							    iOS 26's floating bar items. Anything that lands in the bar later
							    comes out of this. */}
							<View className="max-w-52">
								<Text className="font-semibold text-[17px]" numberOfLines={1}>
									{workspace?.name ?? cloud?.name ?? ""}
								</Text>
							</View>
						</PressableScale>
					</Stack.Title>
				)}
			</Stack.Screen>

			{banner && activeTerminalId ? (
				<View className="bg-muted px-3 py-1.5">
					<Text className="text-muted-foreground text-center text-xs">
						{banner}
					</Text>
				</View>
			) : null}
			{connectionState === "error" && activeTerminalId ? (
				<View className="bg-muted flex-row items-center justify-center gap-3 px-3 py-1.5">
					<Text className="text-muted-foreground text-xs">
						<Trans>Connection failed.</Trans>
					</Text>
					<Pressable onPress={() => terminalRef.current?.retry()}>
						<Text className="text-foreground text-xs font-medium">
							<Trans>Retry</Trans>
						</Text>
					</Pressable>
				</View>
			) : null}

			<View
				className="flex-1"
				style={{
					// The terminal has to clear everything stacked at the bottom or its
					// own prompt hides behind the composer.
					marginBottom: showComposer
						? composerHeight + composerBottom
						: composerBottom,
				}}
			>
				{hostCompatibility.incompatible ? (
					<WorkspacePlaceholder
						body={t({
							message: `${host?.name ?? t({ message: "This host" })} is running host service ${hostCompatibility.hostVersion} — this app needs ${hostCompatibility.minVersion} or newer. Update Superset on that machine.`,
						})}
						icon={TriangleAlert}
						onRefresh={onRefresh}
						refreshing={refreshing}
						title={t({
							message: "This host needs an update",
						})}
					/>
				) : activeTerminalId && host && id ? (
					<>
						<TerminalWebView
							ref={terminalRef}
							workspaceId={id}
							terminalId={activeTerminalId}
							host={host}
							onStateChange={setConnectionState}
							onControl={handleControl}
							onSelectChange={setSelect}
							onCopied={handleCopied}
							onScrollChange={setAtBottom}
							// Tap-to-dismiss without an overlay: a Pressable stacked over
							// the WebView also ate scroll drags, so the scrollback froze
							// whenever the keyboard was up. The page reports plain taps
							// instead, and drags stay with the terminal.
							onTap={handleTerminalTap}
						/>
						{/* The WebView swallows every touch that lands on it, so the back
						    swipe never starts over the terminal. This strip keeps a
						    finger's width of the left edge native, which is all UIKit
						    needs. Dragging further right stays the terminal's — WebKit
						    still owns those touches, so no drag over output can pop.
						    A Pressable rather than a plain View because an undrawn View
						    can be flattened away — leaving the edge to WebKit again. */}
						<Pressable
							// Silent to VoiceOver: it is always mounted, and a terminal
							// tap already dismisses the keyboard.
							accessible={false}
							className="absolute bottom-0 left-0 top-0 w-5"
							onPress={() => composerRef.current?.blur()}
						/>
						{/* After the dismiss target so it stays tappable with the
						    keyboard up, and hidden in select mode: the frozen snapshot
						    covers the viewport this would move. Always mounted — it
						    fades itself, which it cannot do if the parent unmounts it. */}
						<ScrollToBottomButton
							visible={!atBottom && !select.active}
							onPress={() => {
								// The tap lands in SwiftUI, where RN autocapture cannot see
								// it — this surface only exists if it is captured by hand.
								posthog.capture("terminal_scrolled_to_bottom", {
									workspace_id: id ?? null,
									source: "button",
								});
								terminalRef.current?.scrollToBottom();
							}}
						/>
					</>
				) : cloud && !workspace ? (
					<CloudWorkspaceProvisioningState cloud={cloud} />
				) : isResolving || (!isReady && host) ? (
					<Centered>
						<ActivityIndicator />
					</Centered>
				) : !host ? (
					<WorkspacePlaceholder
						body={t({
							message:
								"It will reconnect on its own once the machine is back. Pull to check again.",
						})}
						icon={CloudOff}
						onRefresh={onRefresh}
						refreshing={refreshing}
						title={t({
							message: "This workspace's host is offline",
						})}
					/>
				) : (
					<WorkspacePlaceholder
						action={
							<Pressable
								accessibilityRole="button"
								className="bg-secondary h-[38px] flex-row items-center justify-center gap-1.5 rounded-md px-5 active:opacity-80"
								onPress={openAddMenu}
							>
								<Icon as={Plus} className="text-foreground size-4" />
								<Text className="font-medium text-[15px]">
									<Trans>Start a session</Trans>
								</Text>
							</Pressable>
						}
						body={t({
							message:
								"Start an agent or a terminal to begin working in this workspace.",
						})}
						icon={SquareTerminal}
						onRefresh={onRefresh}
						refreshing={refreshing}
						title={t({
							message: "No sessions yet",
						})}
					/>
				)}
			</View>

			{showComposer ? (
				<TerminalComposer
					workspaceId={id}
					allowAttachments={activeRow?.agentId != null}
					slashCommands={slashCommands}
					// A cloud workspace exists on screen before anything serves
					// it; the strip would offer sessions on a sandbox that is not
					// up yet.
					sessionTabs={cloud && !workspace ? [] : sessionTabs}
					onSessionTabPress={pickTerminal}
					onSessionTabClose={confirmCloseTerminal}
					onSessionTabCopyId={copyTerminalId}
					onNewSessionPress={openAddMenu}
					onAllSessionsPress={openSessions}
					quickKeysAction={pullRequestAction}
					onQuickKeysActionPress={openPullRequests}
					attachmentTarget={attachmentTarget}
					onActiveChange={setComposerActive}
					onHeightChange={setComposerHeight}
					onCopySelection={() => terminalRef.current?.copySelection()}
					onQuickKey={handleQuickKey}
					onSubmit={handleSubmit}
					ref={composerRef}
					selectActive={select.active}
					selectHasSelection={select.hasSelection}
				/>
			) : null}
		</View>
	);
}

function Centered({ children }: { children: React.ReactNode }) {
	return <View className="flex-1 items-center justify-center">{children}</View>;
}
