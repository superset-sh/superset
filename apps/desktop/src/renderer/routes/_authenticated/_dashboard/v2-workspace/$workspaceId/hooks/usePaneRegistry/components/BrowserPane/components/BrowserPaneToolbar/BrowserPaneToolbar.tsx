import { Trans } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { SquareDashedMousePointer } from "lucide-react";
import { useCallback } from "react";
import { TbDeviceDesktop } from "react-icons/tb";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { PaneViewerData } from "../../../../../../types";
import { browserRuntimeRegistry } from "../../browserRuntimeRegistry";
import { designModeStore, useDesignModeState } from "../../designModeStore";
import {
	deviceToolbarStore,
	useDeviceToolbarState,
} from "../../deviceToolbarStore";
import { findBarStore } from "../../findBarStore";
import { useBrowserState } from "../../hooks/useBrowserState";
import { BrowserOverflowMenu } from "../BrowserOverflowMenu";
import { BrowserToolbar } from "../BrowserToolbar";

interface BrowserPaneToolbarProps {
	ctx: RendererContext<PaneViewerData>;
}

export function BrowserPaneToolbar({ ctx }: BrowserPaneToolbarProps) {
	const paneId = ctx.pane.id;
	const state = useBrowserState(paneId);
	const designMode = useDesignModeState(paneId);
	const deviceToolbar = useDeviceToolbarState(paneId);

	const handleToggleDesignMode = useCallback(() => {
		designModeStore.toggle(paneId);
	}, [paneId]);

	const handleOpenDevTools = useCallback(() => {
		electronTrpcClient.browser.openDevTools.mutate({ paneId }).catch(() => {});
	}, [paneId]);

	const handleGoBack = useCallback(() => {
		browserRuntimeRegistry.goBack(paneId);
	}, [paneId]);

	const handleGoForward = useCallback(() => {
		browserRuntimeRegistry.goForward(paneId);
	}, [paneId]);

	const handleReload = useCallback(() => {
		browserRuntimeRegistry.reload(paneId);
	}, [paneId]);

	const handleNavigate = useCallback(
		(url: string) => {
			browserRuntimeRegistry.navigate(paneId, url);
		},
		[paneId],
	);

	const isBlankPage = !state.currentUrl || state.currentUrl === "about:blank";
	const PaneHeaderActions = ctx.components.PaneHeaderActions;

	return (
		<div className="flex h-full w-full min-w-0 items-center justify-between">
			<BrowserToolbar
				currentUrl={state.currentUrl}
				faviconUrl={state.faviconUrl}
				isLoading={state.isLoading}
				canGoBack={state.canGoBack}
				canGoForward={state.canGoForward}
				onGoBack={handleGoBack}
				onGoForward={handleGoForward}
				onReload={handleReload}
				onNavigate={handleNavigate}
			/>
			<div className="flex shrink-0 items-center gap-0.5 pr-1.5">
				<Tooltip disableHoverableContent>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleToggleDesignMode}
							disabled={isBlankPage}
							aria-pressed={designMode.phase !== "idle"}
							className={cn(
								"flex h-[22px] shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium leading-none transition-colors disabled:opacity-40",
								// Armed color matches the in-page picker outline
								// (design-mode-script.ts), not the theme primary.
								designMode.phase !== "idle"
									? "bg-[#0d99ff] text-white hover:bg-[#0d99ff]/90"
									: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
							)}
						>
							<SquareDashedMousePointer className="size-3" />
							<Trans>Design</Trans>
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{designMode.phase !== "idle" ? (
							<Trans>Exit design mode (esc)</Trans>
						) : (
							<Trans>
								Design mode — click any element in the page to send it to an
								agent
							</Trans>
						)}
					</TooltipContent>
				</Tooltip>
				<Tooltip disableHoverableContent>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleOpenDevTools}
							className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground"
						>
							<TbDeviceDesktop className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Open DevTools</Trans>
					</TooltipContent>
				</Tooltip>
				<BrowserOverflowMenu
					paneId={paneId}
					currentUrl={state.currentUrl}
					hasPage={!isBlankPage}
					zoomFactor={state.zoomFactor}
					isDeviceToolbarOpen={deviceToolbar.isOpen}
					onToggleDeviceToolbar={() => deviceToolbarStore.toggle(paneId)}
					onOpenFindBar={() => findBarStore.open(paneId)}
					onNavigateToUrl={handleNavigate}
				/>
				<PaneHeaderActions />
			</div>
		</div>
	);
}
