import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { CloudOff, Plus, SquareTerminal } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Keyboard,
	LayoutAnimation,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";
import {
	getHostTerminalsQueryKey,
	useHostTerminals,
} from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import type { GlassComposerHandle } from "@/screens/(authenticated)/components/GlassComposer";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { useAppReviewPrompt } from "@/screens/(authenticated)/hooks/useAppReviewPrompt";
import { useTerminalSeenStore } from "@/screens/(authenticated)/stores/terminalSeenStore";
import { useTerminalTabOrderStore } from "@/screens/(authenticated)/stores/terminalTabOrderStore";
import { PullRequestsButton } from "../components/PullRequestsButton";
import {
	TerminalComposer,
	type TerminalQuickKey,
} from "../components/TerminalComposer";
import { TerminalTabs } from "../components/TerminalTabs";
import {
	type TerminalConnectionState,
	type TerminalControlMessage,
	TerminalWebView,
	type TerminalWebViewHandle,
} from "../components/TerminalWebView";
import { useWorkspacePullRequests } from "../hooks/useWorkspacePullRequest";
import { orderTerminalRows } from "../utils/orderTerminalRows";
import { WorkspacePlaceholder } from "./components/WorkspacePlaceholder";

const headerOptions = {
	headerShown: true,
	headerBackButtonDisplayMode: "minimal",
	headerShadowVisible: false,
	fullScreenGestureEnabled: false,
} as const;

const STATE_BANNERS: Partial<Record<TerminalConnectionState, string>> = {
	connecting: "Connecting…",
	reconnecting: "Reconnecting…",
	denied: "You don't have access to this terminal.",
};

/**
 * The workspace IS the terminal: sessions render as tabs (agent mark + name),
 * the active tab is the one live attached stream, and the + menu launches a
 * new session from the host's agent presets (or a plain shell). Chrome: the
 * compact header (name → action sheet, Review pill) and the terminal composer.
 */
export function WorkspaceScreen() {
	const params = useLocalSearchParams<{ id: string; tab?: string }>();
	const id = params.id;
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const queryClient = useQueryClient();

	const { workspace, host, isResolving } = useWorkspaceHost(id ?? null);
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

	const hostUrl = host
		? buildRelayHostUrl(host.organizationId, host.machineId)
		: null;
	const routingKey = host
		? buildHostRoutingKey(host.organizationId, host.machineId)
		: null;

	// The + sheet lands back here via dismissTo with the new session in
	// ?tab= — adopt it over any manual pick so the fresh tab activates.
	useEffect(() => {
		if (params.tab) setPickedTerminalId(params.tab);
	}, [params.tab]);

	// Pin whatever ended up active, including the implicit first row: without
	// this, reordering in the sessions sheet moves a different row into first
	// place and the terminal you're watching switches out from under you.
	useEffect(() => {
		if (activeTerminalId) setPickedTerminalId(activeTerminalId);
	}, [activeTerminalId]);

	// Port of desktop's useClearActivePaneAttention: viewing the tab clears
	// its `review` state by advancing the seen mark to the binding's last
	// event (host clock — never the device clock).
	const markTerminalSeen = useTerminalSeenStore(
		(state) => state.markTerminalSeen,
	);
	const requestAppReview = useAppReviewPrompt();
	const activeRow = rows.find((row) => row.terminalId === activeTerminalId);
	useEffect(() => {
		if (activeRow?.attention !== "review") return;
		if (activeRow.lastEventAt === null) return;
		markTerminalSeen(activeRow.terminalId, activeRow.lastEventAt);
		requestAppReview("session_completed");
	}, [activeRow, markTerminalSeen, requestAppReview]);

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
				.finally(invalidateTerminals);
		},
		[workspace, hostUrl, invalidateTerminals],
	);

	// --- active terminal connection (one live stream; tabs switch it) ---
	const terminalRef = useRef<TerminalWebViewHandle>(null);
	const [connectionState, setConnectionState] =
		useState<TerminalConnectionState>("connecting");
	const [composerHeight, setComposerHeight] = useState(0);
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const [composerActive, setComposerActive] = useState(false);
	const composerRef = useRef<GlassComposerHandle>(null);

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

	const handleQuickKey = useCallback((key: TerminalQuickKey) => {
		if (key.data) terminalRef.current?.sendInput(key.data);
	}, []);

	const banner = STATE_BANNERS[connectionState];
	const showComposer = activeTerminalId !== null && routingKey !== null;

	const attachmentTarget = useMemo(
		() =>
			id && hostUrl && workspace?.worktreePath
				? { workspaceId: id, hostUrl, worktreePath: workspace.worktreePath }
				: null,
		[id, hostUrl, workspace],
	);

	return (
		<View className="bg-background flex-1">
			<Stack.Screen options={{ ...headerOptions, title: "Workspace" }}>
				<Stack.Title asChild>
					<PressableScale
						onPress={() =>
							router.push(`/(authenticated)/workspace/${id}/actions`)
						}
						disabled={!workspace}
					>
						{/* Width budget: the back capsule and Review button leave ~210pt
						    of bar on a 390pt screen — wider and the title collides with
						    the back button under iOS 26's floating bar items. */}
						<View className="max-w-52">
							<Text className="font-semibold text-[17px]" numberOfLines={1}>
								{workspace?.name ?? ""}
							</Text>
						</View>
					</PressableScale>
				</Stack.Title>
			</Stack.Screen>

			<TerminalTabs
				rows={rows}
				activeTerminalId={activeTerminalId}
				onSelect={setPickedTerminalId}
				onAdd={openAddMenu}
				onManage={openSessions}
				onClose={killTerminal}
			/>

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
						Connection failed.
					</Text>
					<Pressable onPress={() => terminalRef.current?.retry()}>
						<Text className="text-foreground text-xs font-medium">Retry</Text>
					</Pressable>
				</View>
			) : null}

			<View
				className="flex-1"
				style={{
					marginBottom: showComposer ? composerHeight + composerBottom : 0,
				}}
			>
				{activeTerminalId && routingKey && id ? (
					<>
						<TerminalWebView
							ref={terminalRef}
							workspaceId={id}
							terminalId={activeTerminalId}
							routingKey={routingKey}
							onStateChange={setConnectionState}
							onControl={handleControl}
						/>
						{/* Tap-outside-to-dismiss, the terminal's answer to the home
						    composer's backdrop. Transparent, not a scrim: the point of
						    typing here is watching the output above. */}
						{composerActive ? (
							<Pressable
								accessibilityLabel="Dismiss keyboard"
								onPress={() => composerRef.current?.blur()}
								style={StyleSheet.absoluteFill}
							/>
						) : null}
					</>
				) : isResolving || (!isReady && host) ? (
					<Centered>
						<ActivityIndicator />
					</Centered>
				) : !host ? (
					<WorkspacePlaceholder
						body="It will reconnect on its own once the machine is back. Pull to check again."
						icon={CloudOff}
						onRefresh={onRefresh}
						refreshing={refreshing}
						title="This workspace's host is offline"
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
								<Text className="font-medium text-[15px]">Start a session</Text>
							</Pressable>
						}
						body="Start an agent or a terminal to begin working in this workspace."
						icon={SquareTerminal}
						onRefresh={onRefresh}
						refreshing={refreshing}
						title="No sessions yet"
					/>
				)}
			</View>

			{showComposer || pullRequests.length > 0 ? (
				<View
					className="absolute inset-x-0"
					style={{ bottom: composerBottom }}
					onLayout={(event) =>
						setComposerHeight(event.nativeEvent.layout.height)
					}
				>
					{pullRequests.length > 0 ? (
						<View className="px-4 pb-2">
							<PullRequestsButton
								onPress={() =>
									pullRequests.length > 1
										? router.push({
												pathname: "/workspace/[id]/pull-requests",
												params: { id },
											})
										: router.push({
												pathname:
													"/workspace/[id]/pull-request/[pullRequestId]",
												params: {
													id,
													pullRequestId: String(
														pullRequests[0]?.prNumber ?? "",
													),
												},
											})
								}
								pullRequests={pullRequests}
							/>
						</View>
					) : null}
					{showComposer ? (
						<TerminalComposer
							allowAttachments={activeRow?.agentId != null}
							attachmentTarget={attachmentTarget}
							onActiveChange={setComposerActive}
							onQuickKey={handleQuickKey}
							onSubmit={handleSubmit}
							ref={composerRef}
						/>
					) : null}
				</View>
			) : null}
		</View>
	);
}

function Centered({ children }: { children: React.ReactNode }) {
	return <View className="flex-1 items-center justify-center">{children}</View>;
}
