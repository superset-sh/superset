import { Trans, useLingui } from "@lingui/react/macro";
import type { RendererContext, Tab } from "@superset/panes";
import { useParams } from "@tanstack/react-router";
import { GlobeIcon, SquareDashedMousePointer, XIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ImportHistoryDialog } from "renderer/components/ImportHistoryDialog";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	BROWSER_IMPORT_BANNER_ID,
	useBrowserImportBannerDismissalsStore,
} from "renderer/stores/browser-import-banner-dismissals";
import type { BrowserPaneData, PaneViewerData } from "../../../../types";

import { BrowserErrorOverlay } from "./components/BrowserErrorOverlay";
import { BrowserFindBar } from "./components/BrowserFindBar";
import { BrowserTabFavicon } from "./components/BrowserTabFavicon";
import { ChromeImportBanner } from "./components/ChromeImportBanner";
import { DesignModePopover } from "./components/DesignModePopover";
import { DeviceToolbar } from "./components/DeviceToolbar";
import { DEFAULT_DEVICE_PRESET, DEVICE_PRESETS } from "./constants";
import { designModeStore, useDesignModeState } from "./designModeStore";
import {
	deviceToolbarStore,
	useDeviceToolbarState,
} from "./deviceToolbarStore";
import { findBarStore, useFindBarOpen } from "./findBarStore";
import { useBrowserState } from "./hooks/useBrowserState";
import { usePersistentWebview } from "./hooks/usePersistentWebview";

function getSingleBrowserPane(
	tab: Tab<PaneViewerData>,
): { id: string; data: BrowserPaneData } | null {
	const paneIds = Object.keys(tab.panes);
	if (paneIds.length !== 1) return null;
	const pane = tab.panes[paneIds[0]];
	if (pane.kind !== "browser") return null;
	return { id: pane.id, data: pane.data as BrowserPaneData };
}

export function renderBrowserTabIcon(tab: Tab<PaneViewerData>) {
	const browser = getSingleBrowserPane(tab);
	if (!browser) return null;
	const faviconUrl = browser.data.faviconUrl ?? null;
	// Keyed by page + favicon URL so a failed favicon retries on navigation
	// even when the favicon URL itself is unchanged.
	return (
		<BrowserTabFavicon
			key={`${browser.data.url}|${faviconUrl ?? "none"}`}
			src={faviconUrl}
		/>
	);
}

interface CreateNewAgentSessionInput {
	configId: string;
	placement: "split-pane" | "new-tab";
	prompt: string;
}

interface BrowserPaneProps {
	ctx: RendererContext<PaneViewerData>;
	onCreateNewAgentSession?: (
		input: CreateNewAgentSessionInput,
	) => Promise<{ terminalId: string } | null>;
	/** Bring the pane hosting this agent terminal to the front. */
	onFocusAgentTerminal?: (terminalId: string) => void;
}

export function BrowserPane({
	ctx,
	onCreateNewAgentSession,
	onFocusAgentTerminal,
}: BrowserPaneProps) {
	const { t } = useLingui();
	const paneId = ctx.pane.id;
	const state = useBrowserState(paneId);
	const { placeholderRef, reload } = usePersistentWebview({ paneId, ctx });
	const { workspaceId } = useParams({ strict: false });
	const designMode = useDesignModeState(paneId);
	const isFindBarOpen = useFindBarOpen(paneId);
	const deviceToolbar = useDeviceToolbarState(paneId);
	const rootRef = useRef<HTMLDivElement | null>(null);

	// A pane switch or unmount must not leave a stale picker overlay armed in
	// the guest, nor an await resolving into a pane that no longer shows it.
	useEffect(() => {
		return () => {
			if (designModeStore.getState(paneId).phase !== "idle") {
				designModeStore.exit(paneId);
			}
			findBarStore.close(paneId);
			deviceToolbarStore.reset(paneId);
		};
	}, [paneId]);

	// Esc while the host (not the guest) owns focus: with a captured element it
	// discards the capture and goes back to picking; while picking it exits.
	// The injected overlay handles Esc itself when the guest has focus, and the
	// composer's own Esc handler covers its textarea. Scoped to keystrokes that
	// belong to this pane (or to nothing — body): Esc aimed at a portal
	// (dropdown, dialog, the composer's agent picker) must close that instead.
	useEffect(() => {
		if (designMode.phase === "idle") return;
		const phase = designMode.phase;
		const handleKeyDown = (e: KeyboardEvent): void => {
			if (e.key !== "Escape" || e.defaultPrevented) return;
			const target = e.target as HTMLElement | null;
			if (
				target &&
				(target.isContentEditable ||
					target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA")
			) {
				return;
			}
			const root = rootRef.current;
			const inScope =
				target === document.body ||
				(root != null && target != null && root.contains(target));
			if (!inScope) return;
			e.preventDefault();
			e.stopPropagation();
			if (phase === "confirming") {
				designModeStore.rearm(paneId);
			} else {
				designModeStore.exit(paneId);
			}
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [designMode.phase, paneId]);

	// A full navigation replaces the document a capture described — drop the
	// composer instead of staging a payload (selector, bounds, verify hints)
	// for a page that no longer exists.
	useEffect(() => {
		if (designMode.phase === "confirming" && state.isLoading) {
			designModeStore.exit(paneId);
		}
	}, [designMode.phase, state.isLoading, paneId]);

	const isBlankPage = !state.currentUrl || state.currentUrl === "about:blank";

	const deviceForToolbar =
		DEVICE_PRESETS.find((d) => d.id === deviceToolbar.deviceId) ??
		DEFAULT_DEVICE_PRESET;
	const deviceToolbarSize = deviceToolbar.isRotated
		? { width: deviceForToolbar.height, height: deviceForToolbar.width }
		: { width: deviceForToolbar.width, height: deviceForToolbar.height };

	// Anchor the composer under the clicked element: the capture's viewport
	// rect is in guest CSS pixels, which map 1:1 onto the placeholder's box
	// (the webview mirrors the placeholder rect, and the pane root is the
	// offset parent of both the placeholder and the popover). Computed in a
	// layout effect (refs are unset during the first render of a remount) and
	// re-clamped when the pane resizes so the card stays inside it.
	const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({
		top: 12,
		left: 12,
	});
	const confirmingRect =
		designMode.phase === "confirming"
			? designMode.payload?.target.rectViewport
			: undefined;
	useLayoutEffect(() => {
		if (!confirmingRect) return;
		const root = rootRef.current;
		if (!root) return;
		const compute = () => {
			const placeholder = placeholderRef.current;
			if (!placeholder) return;
			const width = Math.min(420, root.clientWidth - 16);
			const estimatedHeight = 170;
			const left = Math.min(
				Math.max(placeholder.offsetLeft + confirmingRect.x, 8),
				Math.max(8, root.clientWidth - width - 8),
			);
			const below =
				placeholder.offsetTop + confirmingRect.y + confirmingRect.height + 4;
			const top =
				below + estimatedHeight > root.clientHeight
					? Math.max(
							8,
							placeholder.offsetTop + confirmingRect.y - estimatedHeight - 4,
						)
					: below;
			setPopoverStyle({ top, left, width });
		};
		compute();
		const observer = new ResizeObserver(compute);
		observer.observe(root);
		return () => observer.disconnect();
	}, [confirmingRect, placeholderRef]);

	// Offer importing from another browser — as a banner above the page, not
	// just on the empty new-tab state — but only when one is actually
	// detected, so the CTA is never a dead end. Dismissal is persisted and
	// app-wide (see the store): local state here would reset on every remount
	// and bleed between panes through the unkeyed pane-component reuse.
	const [importSource, setImportSource] = useState<{
		browserKey: string;
		browserName: string;
	} | null>(null);
	const [isImportOpen, setIsImportOpen] = useState(false);
	const isBannerDismissed = useBrowserImportBannerDismissalsStore((s) =>
		s.isDismissed(BROWSER_IMPORT_BANNER_ID),
	);
	const dismissBanner = useBrowserImportBannerDismissalsStore((s) => s.dismiss);
	useEffect(() => {
		let cancelled = false;
		electronTrpcClient.browserHistory.getImportSources
			.query()
			.then((result) => {
				if (cancelled) return;
				const source = result.sources[0];
				setImportSource(
					source
						? {
								browserKey: source.browserKey,
								browserName: source.browserName,
							}
						: null,
				);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		// min-w-0: without it the banner row's intrinsic width becomes the pane
		// root's flex min-content, overflowing the pane slot — and the webview
		// follows the placeholder rect, painting over the neighbor pane.
		<div ref={rootRef} className="relative flex h-full min-w-0 flex-1 flex-col">
			{designMode.phase !== "idle" && (
				// relative z-20: must stay clickable above the confirming-phase
				// click-catcher (z-10) so the exit button keeps working.
				<div className="relative z-20 flex shrink-0 items-center gap-2 border-b border-border/60 bg-[#0d99ff]/10 px-3 py-1.5 text-xs text-foreground/90">
					<SquareDashedMousePointer className="size-3.5 shrink-0 text-[#0d99ff]" />
					<span className="min-w-0 flex-1 truncate">
						{designMode.phase === "selecting" ? (
							<Trans>
								Design mode — click any element in the page to send it to an
								agent.
							</Trans>
						) : (
							<Trans>
								Element captured — describe the change, or press esc to pick
								again.
							</Trans>
						)}
					</span>
					{designMode.phase === "selecting" && (
						<span className="shrink-0 text-muted-foreground/70">
							<Trans>esc to exit</Trans>
						</span>
					)}
					<button
						type="button"
						onClick={() => designModeStore.exit(paneId)}
						aria-label={t({
							message: "Exit design mode",
						})}
						className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						<XIcon className="size-3.5" />
					</button>
				</div>
			)}
			{importSource && !isBannerDismissed && (
				<ChromeImportBanner
					browserKey={importSource.browserKey}
					browserName={importSource.browserName}
					onImport={() => setIsImportOpen(true)}
					onDismiss={() => dismissBanner(BROWSER_IMPORT_BANNER_ID)}
				/>
			)}
			{deviceToolbar.isOpen && (
				<DeviceToolbar
					state={deviceToolbar}
					onSetDevice={(deviceId) =>
						deviceToolbarStore.setDevice(paneId, deviceId)
					}
					onToggleRotate={() => deviceToolbarStore.toggleRotate(paneId)}
					onClose={() => deviceToolbarStore.close(paneId)}
				/>
			)}
			<div
				className={
					deviceToolbar.isOpen
						? "flex min-h-0 w-full flex-1 items-center justify-center overflow-auto bg-muted/20"
						: "min-h-0 w-full flex-1"
				}
			>
				<div
					ref={placeholderRef}
					style={
						deviceToolbar.isOpen
							? {
									width: deviceToolbarSize.width,
									height: deviceToolbarSize.height,
								}
							: undefined
					}
					className={
						deviceToolbar.isOpen ? "shrink-0 shadow-lg" : "h-full w-full"
					}
				/>
			</div>
			{isFindBarOpen && (
				<BrowserFindBar
					paneId={paneId}
					onClose={() => findBarStore.close(paneId)}
				/>
			)}
			{designMode.phase === "confirming" &&
				designMode.payload &&
				workspaceId && (
					<>
						{/* Click-catcher: the guest overlay froze pointer events on
						    selection, so without this a stray page click would
						    navigate out from under the open composer. */}
						<button
							type="button"
							aria-label={t({
								message: "Discard captured element",
							})}
							onClick={() => designModeStore.rearm(paneId)}
							className="absolute inset-0 z-10 cursor-default"
						/>
						<DesignModePopover
							workspaceId={workspaceId}
							paneId={paneId}
							payload={designMode.payload}
							style={popoverStyle}
							onDismiss={() => designModeStore.rearm(paneId)}
							onSent={() => designModeStore.exit(paneId)}
							onCreateNewAgentSession={onCreateNewAgentSession}
							onFocusAgentTerminal={onFocusAgentTerminal}
						/>
					</>
				)}
			{state.error && !state.isLoading && (
				<BrowserErrorOverlay error={state.error} onRetry={reload} />
			)}
			{isBlankPage && !state.isLoading && !state.error && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
					<div className="flex w-full max-w-sm flex-col items-center gap-5 px-6">
						<div className="flex size-14 items-center justify-center rounded-2xl bg-muted/50">
							<GlobeIcon className="size-7 text-muted-foreground" />
						</div>
						<div className="text-center">
							<p className="text-base font-medium text-foreground">
								<Trans>Start browsing</Trans>
							</p>
							<p className="mt-1.5 text-sm text-muted-foreground">
								<Trans>Enter a URL into the search bar above.</Trans>
							</p>
						</div>
					</div>
				</div>
			)}
			<ImportHistoryDialog open={isImportOpen} onOpenChange={setIsImportOpen} />
		</div>
	);
}
