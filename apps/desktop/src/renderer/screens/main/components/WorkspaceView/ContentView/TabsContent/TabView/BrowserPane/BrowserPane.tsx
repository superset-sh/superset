import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { GlobeIcon } from "lucide-react";
import { useCallback, useRef } from "react";
import { TbDeviceDesktop, TbPencil } from "react-icons/tb";
import type { MosaicBranch } from "react-mosaic-component";
import { useTabsStore } from "renderer/stores/tabs/store";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { BrowserErrorOverlay } from "./components/BrowserErrorOverlay";
import { BrowserToolbar } from "./components/BrowserToolbar";
import { BrowserOverflowMenu } from "./components/BrowserToolbar/components/BrowserOverflowMenu";
import { SendAnnotationsDialog } from "./components/SendAnnotationsDialog";
import { DEFAULT_BROWSER_URL } from "./constants";
import { useAnnotationMode } from "./hooks/useAnnotationMode";
import { useBrowserNavigation } from "./hooks/useBrowserNavigation";

interface BrowserPaneProps {
	paneId: string;
	path: MosaicBranch[];
	isActive: boolean;
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

export function BrowserPane({
	paneId,
	path,
	isActive,
	tabId,
	workspaceId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: BrowserPaneProps) {
	const pane = useTabsStore((s) => s.panes[paneId]);
	const openDevToolsPane = useTabsStore((s) => s.openDevToolsPane);
	const browserState = pane?.browser;
	const currentUrl = browserState?.currentUrl ?? DEFAULT_BROWSER_URL;
	const pageTitle =
		browserState?.history[browserState.historyIndex]?.title ?? "";
	const isLoading = browserState?.isLoading ?? false;
	const loadError = browserState?.error ?? null;
	const isBlankPage = currentUrl === "about:blank";

	// Capture the initial URL on first render only — subsequent navigations
	// are handled via webview.loadURL() to preserve browser history.
	const initialUrlRef = useRef(currentUrl);

	const {
		setWebviewRef,
		goBack,
		goForward,
		reload,
		navigateTo,
		canGoBack,
		canGoForward,
	} = useBrowserNavigation({
		paneId,
		initialUrl: initialUrlRef.current,
	});

	const {
		isActive: isAnnotationActive,
		toggle: toggleAnnotation,
		dialogOpen,
		annotationData,
		closeDialog,
		agent,
		setAgent,
	} = useAnnotationMode({ paneId, workspaceId });

	const webviewRefCallback = useCallback(
		(node: HTMLElement | null) => {
			setWebviewRef(node as Electron.WebviewTag | null);
		},
		[setWebviewRef],
	);

	const handleOpenDevTools = useCallback(() => {
		openDevToolsPane(tabId, paneId, path);
	}, [openDevToolsPane, tabId, paneId, path]);

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			isActive={isActive}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={(handlers) => (
				<div className="flex h-full w-full items-center justify-between min-w-0">
					<BrowserToolbar
						currentUrl={currentUrl}
						pageTitle={pageTitle}
						isLoading={isLoading}
						canGoBack={canGoBack}
						canGoForward={canGoForward}
						onGoBack={goBack}
						onGoForward={goForward}
						onReload={reload}
						onNavigate={navigateTo}
					/>
					<div className="flex items-center shrink-0">
						<div className="mx-1.5 h-3.5 w-px bg-muted-foreground/60" />
						<PaneToolbarActions
							splitOrientation={handlers.splitOrientation}
							onSplitPane={handlers.onSplitPane}
							onClosePane={handlers.onClosePane}
							closeHotkeyId="CLOSE_TERMINAL"
							leadingActions={
								<>
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												onClick={toggleAnnotation}
												className={`rounded p-0.5 transition-colors ${
													isAnnotationActive
														? "text-primary"
														: "text-muted-foreground/60 hover:text-muted-foreground"
												}`}
											>
												<TbPencil className="size-3.5" />
											</button>
										</TooltipTrigger>
										<TooltipContent side="bottom" showArrow={false}>
											{isAnnotationActive ? "Stop annotating" : "Annotate page"}
										</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												onClick={handleOpenDevTools}
												className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
											>
												<TbDeviceDesktop className="size-3.5" />
											</button>
										</TooltipTrigger>
										<TooltipContent side="bottom" showArrow={false}>
											Open DevTools
										</TooltipContent>
									</Tooltip>
									<BrowserOverflowMenu paneId={paneId} hasPage={!isBlankPage} />
								</>
							}
						/>
					</div>
				</div>
			)}
		>
			<div className="relative flex flex-1 h-full">
				<webview
					ref={webviewRefCallback}
					src={initialUrlRef.current}
					partition="persist:superset"
					// @ts-expect-error -- allowpopups is a valid webview attribute but not in React types
					allowpopups="true"
					data-pane-id={paneId}
					className="w-full h-full"
					style={{ display: "flex", flex: 1 }}
				/>
				{loadError && !isLoading && (
					<BrowserErrorOverlay error={loadError} onRetry={reload} />
				)}
				{isBlankPage && !isLoading && !loadError && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background pointer-events-none">
						<GlobeIcon className="size-10 text-muted-foreground/30" />
						<div className="text-center">
							<p className="text-sm font-medium text-muted-foreground/50">
								Browser
							</p>
							<p className="mt-1 text-xs text-muted-foreground/30">
								Enter a URL above, or instruct an agent to navigate
								<br />
								and use the browser
							</p>
						</div>
					</div>
				)}
			</div>
			<SendAnnotationsDialog
				open={dialogOpen}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
				annotationData={annotationData}
				workspaceId={workspaceId}
				agent={agent}
				onAgentChange={setAgent}
			/>
		</BasePaneWindow>
	);
}
