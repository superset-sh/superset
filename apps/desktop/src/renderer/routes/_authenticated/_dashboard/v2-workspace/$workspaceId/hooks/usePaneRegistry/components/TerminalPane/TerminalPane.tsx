import { useLingui } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import "@xterm/xterm/css/xterm.css";
import { useFeatureFlagEnabled } from "posthog-js/react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useHotkey } from "renderer/hotkeys";
import {
	actionLabel,
	type FolderClickPolicy,
	folderIntentLabel,
	LinkHoverHint,
	useTerminalFilePolicy,
	useTerminalFolderPolicy,
	useTerminalUrlPolicy,
} from "renderer/lib/clickPolicy";
import {
	type ConnectionState,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useRevealInFinder } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRevealInFinder";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useWorkspaceWsUrl } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceTrpcProvider/WorkspaceTrpcProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { ScrollToBottomButton } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/ScrollToBottomButton";
import { TerminalSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/TerminalSearch";
import { useTheme } from "renderer/stores/theme";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";
import { isWithinWorkspacePath } from "shared/absolute-paths";
import { TerminalAgentAutoResume } from "./components/TerminalAgentAutoResume";
import { TerminalCopiedIndicator } from "./components/TerminalCopiedIndicator";
import { TerminalRichInput } from "./components/TerminalRichInput";
import { terminalContextMenuLinkStore } from "./contextMenuLinkStore";
import { useCopyOnSelect } from "./hooks/useCopyOnSelect";
import { useLinkClickHint } from "./hooks/useLinkClickHint";
import { type HoveredLink, useLinkHoverState } from "./hooks/useLinkHoverState";
import { useTerminalAppearance } from "./hooks/useTerminalAppearance";
import { useTerminalInterruptClear } from "./hooks/useTerminalInterruptClear";
import {
	terminalRichInputOpenStore,
	useTerminalRichInputOpen,
} from "./richInputOpenStore";
import { PasteUploadLimitError, uploadPastedFiles } from "./uploadPastedFiles";
import { shellEscapePaths } from "./utils";
import {
	runFileLinkAction,
	runFolderLinkAction,
	runUrlLinkAction,
	type TerminalLinkActionDeps,
} from "./utils/runTerminalLinkAction";

interface TerminalPaneProps {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onRevealPath: (path: string, options?: { isDirectory?: boolean }) => void;
}

export function TerminalPane({
	ctx,
	workspaceId,
	onOpenFile,
	onRevealPath,
}: TerminalPaneProps) {
	const { t } = useLingui();
	const filePolicy = useTerminalFilePolicy();
	const urlPolicy = useTerminalUrlPolicy();
	const folderPolicy = useTerminalFolderPolicy();
	const isPagesEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PAGES) ?? false;
	const {
		hoveredLink,
		liveHoveredLinkRef,
		onHover: onLinkHover,
		onLeave: onLinkLeave,
	} = useLinkHoverState();
	const { hint, showHint } = useLinkClickHint();
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const revealInFinder = useRevealInFinder(workspaceId);
	// The "reveal" intent falls back to Finder for folders outside the
	// worktree (revealPath's containment check); the hover label needs the
	// same knowledge so it doesn't promise a sidebar reveal it can't do.
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspaceQuery.data?.worktreePath ?? undefined;
	const paneData = ctx.pane.data as TerminalPaneData;
	const { terminalId } = paneData;
	const terminalInstanceId = ctx.pane.id;
	const containerRef = useRef<HTMLDivElement | null>(null);
	// Link actions are fired from event handlers (xterm clicks, context-menu
	// selections) that outlive the render they were registered in, so the deps
	// are read through a ref.
	const linkActionDepsRef = useRef<TerminalLinkActionDeps>({
		store: ctx.store,
		isPagesEnabled,
		onOpenFile,
		onRevealPath,
		openInExternalEditor,
		revealInFinder,
		worktreePath,
	});
	linkActionDepsRef.current = {
		store: ctx.store,
		isPagesEnabled,
		onOpenFile,
		onRevealPath,
		openInExternalEditor,
		revealInFinder,
		worktreePath,
	};
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	// Open/closed is tracked per terminalId in a shared store so the header
	// button and the ⌘I hotkey toggle the same overlay, and the state survives
	// the mounted pane being re-pointed across terminals (tab switch, session
	// dropdown).
	const isRichInputOpen = useTerminalRichInputOpen();

	const appearance = useTerminalAppearance();
	const appearanceRef = useRef(appearance);
	appearanceRef.current = appearance;

	// themeType reaches the host-side respawn fallback so a restored shell
	// gets the right COLORFGBG; PTY env is set at spawn time only.
	const activeTheme = useTheme();
	const themeType = resolveTerminalThemeType({
		activeThemeType: activeTheme?.type,
	});
	const baseWebsocketUrl = useWorkspaceWsUrl(`/terminal/${terminalId}`);
	const themedUrl = new URL(baseWebsocketUrl);
	themedUrl.searchParams.set("workspaceId", workspaceId);
	themedUrl.searchParams.set("themeType", themeType);
	if (paneData.createOnAttach) {
		themedUrl.searchParams.set("create", "1");
	}
	const websocketUrl = themedUrl.toString();
	const websocketUrlRef = useRef(websocketUrl);
	websocketUrlRef.current = websocketUrl;
	const workspaceIdRef = useRef(workspaceId);
	workspaceIdRef.current = workspaceId;

	const workspaceTrpcUtils = workspaceTrpc.useUtils();
	const invalidateTerminalSessionsRef = useRef(
		workspaceTrpcUtils.terminal.list.invalidate,
	);
	invalidateTerminalSessionsRef.current =
		workspaceTrpcUtils.terminal.list.invalidate;

	// useCallback so useSyncExternalStore doesn't re-subscribe every render —
	// otherwise every keystroke-triggered re-render unsubscribes and
	// re-subscribes the registry listener. See React's useSyncExternalStore
	// docs ("If you don't memoize the subscribe function…").
	const subscribe = useCallback(
		(callback: () => void) =>
			terminalRuntimeRegistry.onStateChange(
				terminalId,
				callback,
				terminalInstanceId,
			),
		[terminalId, terminalInstanceId],
	);
	const getSnapshot = useCallback(
		(): ConnectionState =>
			terminalRuntimeRegistry.getConnectionState(
				terminalId,
				terminalInstanceId,
			),
		[terminalId, terminalInstanceId],
	);
	const connectionState = useSyncExternalStore(subscribe, getSnapshot);

	// DOM-first lifecycle (VSCode/Tabby pattern):
	//   1. mount() attaches xterm to the container synchronously — terminal
	//      is visible immediately, even on cold start. For a warm return
	//      (workspace switch) this reparents the wrapper from the parking
	//      container back into the live tree, preserving the buffer.
	//   2. connect() attaches the WebSocket to that terminalId. The socket is
	//      transport only; it does not carry creation-time intent.
	// The pane never calls createSession over HTTP. Optimistically-inserted
	// panes (`createOnAttach`) let the WS attach create the session; other
	// panes' sessions were created by useV2TerminalLauncher before the pane
	// landed in the store.
	// Deps narrowed to the terminal identity so provider key remount churn
	// (workspaceId/client briefly flipping while pane data catches up) doesn't
	// re-run this effect. Mutable inputs are read through refs.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		terminalRuntimeRegistry.mount(
			terminalId,
			container,
			appearanceRef.current,
			terminalInstanceId,
		);

		terminalRuntimeRegistry.connect(
			terminalId,
			websocketUrlRef.current,
			terminalInstanceId,
		);

		return () => {
			terminalRuntimeRegistry.detach(terminalId, terminalInstanceId);
		};
	}, [terminalId, terminalInstanceId]);

	useEffect(() => {
		if (!ctx.isActive) return;
		// Don't pull focus back to xterm while the rich-input overlay owns it.
		if (isRichInputOpen) return;

		terminalRuntimeRegistry
			.getTerminal(terminalId, terminalInstanceId)
			?.focus();
	}, [ctx.isActive, terminalId, terminalInstanceId, isRichInputOpen]);

	const lastInvalidatedOpenSessionRef = useRef<string | null>(null);
	useEffect(() => {
		const invalidateSessionsAfterSocketOpen = () => {
			if (
				terminalRuntimeRegistry.getConnectionState(
					terminalId,
					terminalInstanceId,
				) !== "open"
			) {
				lastInvalidatedOpenSessionRef.current = null;
				return;
			}

			const sessionWorkspaceId = workspaceIdRef.current;
			const invalidateKey = `${sessionWorkspaceId}:${terminalId}:${terminalInstanceId}:${websocketUrlRef.current}`;
			if (lastInvalidatedOpenSessionRef.current === invalidateKey) return;
			lastInvalidatedOpenSessionRef.current = invalidateKey;

			void invalidateTerminalSessionsRef.current({
				workspaceId: sessionWorkspaceId,
			});
		};

		invalidateSessionsAfterSocketOpen();
		return terminalRuntimeRegistry.onStateChange(
			terminalId,
			invalidateSessionsAfterSocketOpen,
			terminalInstanceId,
		);
	}, [terminalId, terminalInstanceId]);

	// WS URL can change while the terminal stays mounted (token refresh, host
	// URL re-resolution on provider remount). Reconnect only if the transport
	// is already live — on initial mount the transport is "disconnected" and
	// we let the mount path above open it.
	// Reconnect on base-URL change only; themeType lives on the ref so a
	// theme toggle doesn't tear down a live shell for a visual-only change.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
	useEffect(() => {
		terminalRuntimeRegistry.reconnect(
			terminalId,
			websocketUrlRef.current,
			terminalInstanceId,
		);
	}, [terminalId, terminalInstanceId, baseWebsocketUrl]);

	useEffect(() => {
		terminalRuntimeRegistry.updateAppearance(
			terminalId,
			appearance,
			terminalInstanceId,
		);
	}, [terminalId, terminalInstanceId, appearance]);

	// --- Link handlers ---
	// All filesystem operations go through the host service.
	// statPath is a mutation (POST) to avoid tRPC GET URL encoding issues
	// with paths containing special characters like ().
	const statPathMutation = workspaceTrpc.filesystem.statPath.useMutation();
	const statPathRef = useRef(statPathMutation.mutateAsync);
	statPathRef.current = statPathMutation.mutateAsync;

	useEffect(() => {
		terminalRuntimeRegistry.setLinkHandlers(
			terminalId,
			{
				stat: async (path) => {
					try {
						const result = await statPathRef.current({
							workspaceId,
							path,
						});
						if (!result) return null;
						return {
							isDirectory: result.isDirectory,
							resolvedPath: result.resolvedPath,
						};
					} catch {
						return null;
					}
				},
				onFileLinkClick: (event, link) => {
					if (link.isDirectory) {
						const intent = folderPolicy.getIntent(event);
						if (intent === null) {
							showHint(event.clientX, event.clientY);
							return;
						}
						event.preventDefault();
						runFolderLinkAction(
							linkActionDepsRef.current,
							link.resolvedPath,
							intent,
						);
						return;
					}

					const action = filePolicy.getAction(event);
					if (action === null) {
						showHint(event.clientX, event.clientY);
						return;
					}
					event.preventDefault();
					runFileLinkAction(
						linkActionDepsRef.current,
						{ path: link.resolvedPath, row: link.row, col: link.col },
						action,
					);
				},
				onUrlClick: (event, url) => {
					const action = urlPolicy.getAction(event);
					if (action === null) {
						showHint(event.clientX, event.clientY);
						return;
					}
					event.preventDefault();
					runUrlLinkAction(linkActionDepsRef.current, url, action);
				},
				onLinkHover,
				onLinkLeave,
			},
			terminalInstanceId,
		);
	}, [
		terminalId,
		terminalInstanceId,
		workspaceId,
		onLinkHover,
		onLinkLeave,
		showHint,
		filePolicy,
		urlPolicy,
		folderPolicy,
	]);

	// Publish what a right-click landed on so the pane context menu (built in
	// usePaneRegistry, outside this component) can offer "Open in". Capture
	// phase runs before Radix opens the menu, while the pointer is still over
	// the link, and a right-click on blank terminal records null.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const onContextMenu = () => {
			terminalContextMenuLinkStore.record(terminalInstanceId, {
				link: liveHoveredLinkRef.current?.info ?? null,
				deps: linkActionDepsRef.current,
			});
		};
		container.addEventListener("contextmenu", onContextMenu, true);
		return () => {
			container.removeEventListener("contextmenu", onContextMenu, true);
			terminalContextMenuLinkStore.clear(terminalInstanceId);
		};
	}, [terminalInstanceId, liveHoveredLinkRef]);

	// --- Remote image paste ---
	// The default paste path forwards Ctrl+V and lets the TUI read the OS
	// clipboard — which only exists on the machine the PTY runs on. When the
	// workspace lives on another host (relay-reached machine, cloud sandbox),
	// ship the clipboard bytes there via filesystem.writeFile and paste the
	// resulting paths instead. Local workspaces keep the Ctrl+V forward, which
	// lets TUIs attach the image natively.
	const { machineId } = useLocalHostService();
	const hostWorkspaces = useHostWorkspaces();
	const workspaceHostId = hostWorkspaces.workspaces.find(
		(w) => w.id === workspaceId,
	)?.hostId;
	// A cloud sandbox workspace has no host row, so "known list is ready and
	// the workspace isn't in it" also means remote. Until the list is ready
	// the override stays unset and paste falls back to the local behavior.
	const isRemoteHost =
		hostWorkspaces.isReady &&
		Boolean(machineId) &&
		workspaceHostId !== machineId;

	const writeFileMutation = workspaceTrpc.filesystem.writeFile.useMutation();
	const createDirectoryMutation =
		workspaceTrpc.filesystem.createDirectory.useMutation();
	const writeFileRef = useRef(writeFileMutation.mutateAsync);
	writeFileRef.current = writeFileMutation.mutateAsync;
	const createDirectoryRef = useRef(createDirectoryMutation.mutateAsync);
	createDirectoryRef.current = createDirectoryMutation.mutateAsync;

	// Fire-and-forget: ship files to the workspace, then paste the paths.
	const uploadAndPasteFiles = useCallback(
		(files: File[], worktree: string) => {
			void (async () => {
				try {
					const paths = await uploadPastedFiles({
						deps: {
							createDirectory: (input) => createDirectoryRef.current(input),
							writeFile: (input) => writeFileRef.current(input),
						},
						workspaceId,
						worktreePath: worktree,
						files,
					});
					terminalRuntimeRegistry.paste(
						terminalId,
						shellEscapePaths(paths),
						terminalInstanceId,
					);
				} catch (error) {
					console.error("[v2 Terminal] remote file upload failed", error);
					toast.error(
						error instanceof PasteUploadLimitError
							? error.message
							: files.length === 1
								? t({
										message: "Failed to send the file to the remote workspace",
									})
								: t({
										message: "Failed to send the files to the remote workspace",
									}),
					);
				}
			})();
		},
		[terminalId, terminalInstanceId, workspaceId, t],
	);

	useEffect(() => {
		if (!isRemoteHost || !worktreePath) return;

		terminalRuntimeRegistry.setImagePasteOverride(
			terminalId,
			(files) => uploadAndPasteFiles(files, worktreePath),
			terminalInstanceId,
		);
		return () => {
			terminalRuntimeRegistry.setImagePasteOverride(
				terminalId,
				null,
				terminalInstanceId,
			);
		};
	}, [
		terminalId,
		terminalInstanceId,
		worktreePath,
		isRemoteHost,
		uploadAndPasteFiles,
	]);

	useTerminalInterruptClear({
		terminalId,
		terminalInstanceId,
		workspaceId,
		connectionState,
	});

	useCopyOnSelect({ terminalId, terminalInstanceId, connectionState });

	useHotkey(
		"CLEAR_TERMINAL",
		() => {
			terminalRuntimeRegistry.clear(terminalId, terminalInstanceId);
		},
		{ enabled: ctx.isActive },
	);

	useHotkey(
		"SCROLL_TO_BOTTOM",
		() => {
			terminalRuntimeRegistry.scrollToBottom(terminalId, terminalInstanceId);
		},
		{ enabled: ctx.isActive },
	);

	useHotkey("FIND_IN_TERMINAL", () => setIsSearchOpen((prev) => !prev), {
		enabled: ctx.isActive,
		preventDefault: true,
	});

	useHotkey(
		"TOGGLE_TERMINAL_RICH_INPUT",
		() => terminalRichInputOpenStore.toggle("hotkey"),
		{ enabled: ctx.isActive, preventDefault: true },
	);

	const closeRichInput = useCallback(() => {
		terminalRichInputOpenStore.close("escape");
		terminalRuntimeRegistry
			.getTerminal(terminalId, terminalInstanceId)
			?.focus();
	}, [terminalId, terminalInstanceId]);

	// connectionState in deps ensures terminal ref re-derives after connect/disconnect
	// biome-ignore lint/correctness/useExhaustiveDependencies: connectionState is intentionally included to trigger re-derive
	const terminal = useMemo(
		() => terminalRuntimeRegistry.getTerminal(terminalId, terminalInstanceId),
		[terminalId, terminalInstanceId, connectionState],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: connectionState is intentionally included to trigger re-derive
	const searchAddon = useMemo(
		() =>
			terminalRuntimeRegistry.getSearchAddon(terminalId, terminalInstanceId),
		[terminalId, terminalInstanceId, connectionState],
	);

	const [isDropActive, setIsDropActive] = useState(false);
	const dragCounterRef = useRef(0);

	const resolveDroppedText = (dataTransfer: DataTransfer): string | null => {
		const files = Array.from(dataTransfer.files);
		if (files.length > 0) {
			const paths = files
				.map((file) => window.webUtils.getPathForFile(file))
				.filter(Boolean);
			return paths.length > 0 ? shellEscapePaths(paths) : null;
		}
		const plainText = dataTransfer.getData("text/plain");
		return plainText ? shellEscapePaths([plainText]) : null;
	};

	const handleDragEnter = (event: React.DragEvent) => {
		event.preventDefault();
		dragCounterRef.current += 1;
		setIsDropActive(true);
	};

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	};

	const handleDragLeave = (event: React.DragEvent) => {
		event.preventDefault();
		dragCounterRef.current -= 1;
		if (dragCounterRef.current <= 0) {
			dragCounterRef.current = 0;
			setIsDropActive(false);
		}
	};

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();
		dragCounterRef.current = 0;
		setIsDropActive(false);
		if (connectionState === "closed") return;

		// Dropped OS paths are local paths — meaningless on the machine a
		// remote workspace's PTY runs on. When every dropped entry is a plain
		// file, ship the bytes instead. Folders keep the path flow (their File
		// entries carry no content), which at least preserves today's behavior.
		if (isRemoteHost && worktreePath) {
			const items = Array.from(event.dataTransfer.items);
			const allPlainFiles =
				items.length > 0 &&
				items.every(
					(item) =>
						item.kind === "file" &&
						typeof item.webkitGetAsEntry === "function" &&
						item.webkitGetAsEntry()?.isFile === true,
				);
			const files = Array.from(event.dataTransfer.files);
			if (allPlainFiles && files.length > 0) {
				terminalRuntimeRegistry
					.getTerminal(terminalId, terminalInstanceId)
					?.focus();
				uploadAndPasteFiles(files, worktreePath);
				return;
			}
		}

		const text = resolveDroppedText(event.dataTransfer);
		if (!text) return;
		terminalRuntimeRegistry
			.getTerminal(terminalId, terminalInstanceId)
			?.focus();
		terminalRuntimeRegistry.paste(terminalId, text, terminalInstanceId);
	};

	return (
		<div
			role="application"
			className="relative flex h-full w-full flex-col p-2"
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<div className="relative min-h-0 flex-1 overflow-hidden">
				<TerminalSearch
					searchAddon={searchAddon}
					isOpen={isSearchOpen}
					onClose={() => setIsSearchOpen(false)}
				/>
				<div
					ref={containerRef}
					className="h-full w-full"
					style={{ backgroundColor: appearance.background }}
				/>
				<ScrollToBottomButton terminal={terminal} />
				<TerminalCopiedIndicator terminalInstanceId={terminalInstanceId} />
				<TerminalAgentAutoResume
					key={terminalId}
					workspaceId={workspaceId}
					terminalId={terminalId}
					connectionState={connectionState}
					ctx={ctx}
				/>
			</div>
			<TerminalRichInput
				workspaceId={workspaceId}
				terminalId={terminalId}
				terminalInstanceId={terminalInstanceId}
				isOpen={isRichInputOpen}
				onClose={closeRichInput}
			/>
			<div
				className={cn(
					"pointer-events-none absolute inset-0 bg-primary/10 transition-opacity duration-100",
					isDropActive ? "opacity-75" : "opacity-0",
				)}
			/>
			<LinkHoverHint
				hoverLabel={resolveHoverLabel(
					hoveredLink,
					filePolicy,
					urlPolicy,
					folderPolicy,
					worktreePath,
				)}
				hoverPosition={hoveredLink}
				clickHint={hint}
			/>
		</div>
	);
}

// Compute "what would clicking right now do?" for the live link tooltip.
// Files, URLs, and folders all resolve through their settings-driven
// policies; folders additionally swap "reveal" for the Finder fallback when
// the path sits outside the worktree. Returns null when the matching tier
// is unbound — the tooltip stays hidden in that case.
function resolveHoverLabel(
	hovered: HoveredLink | null,
	filePolicy: ReturnType<typeof useTerminalFilePolicy>,
	urlPolicy: ReturnType<typeof useTerminalUrlPolicy>,
	folderPolicy: FolderClickPolicy,
	worktreePath: string | undefined,
): string | null {
	if (!hovered) return null;
	const event = {
		metaKey: hovered.modifier,
		ctrlKey: false,
		shiftKey: hovered.shift,
	};
	if (hovered.info.kind === "url") {
		const action = urlPolicy.getAction(event);
		return action ? actionLabel(action, "url") : null;
	}
	if (hovered.info.isDirectory) {
		const intent = folderPolicy.getIntent(event);
		// A folder outside the worktree can't be revealed in the sidebar —
		// clicking falls back to Finder (revealPath), so say that instead.
		if (
			intent === "reveal" &&
			worktreePath &&
			hovered.info.resolvedPath &&
			!isWithinWorkspacePath(worktreePath, hovered.info.resolvedPath)
		) {
			return folderIntentLabel("finder");
		}
		return folderIntentLabel(intent);
	}
	const action = filePolicy.getAction(event);
	return action ? actionLabel(action, "file") : null;
}
