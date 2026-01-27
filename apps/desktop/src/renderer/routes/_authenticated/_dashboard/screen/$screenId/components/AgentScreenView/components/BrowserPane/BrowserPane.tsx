import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiArrowPath, HiGlobeAlt, HiXMark } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import {
	agentScreenOperations,
	type BrowserPane as BrowserPaneType,
} from "renderer/stores/agent-screens";

interface BrowserPaneProps {
	pane: BrowserPaneType;
	screenId: string;
	paneId: string;
}

export function BrowserPane({ pane, screenId, paneId }: BrowserPaneProps) {
	const webviewRef = useRef<HTMLWebViewElement | null>(null);
	const [currentUrl, setCurrentUrl] = useState(pane.url);
	const [isLoading, setIsLoading] = useState(true);
	const collections = useCollections();

	// Set up webview event listeners
	useEffect(() => {
		const webview = webviewRef.current;
		if (!webview) return;

		const handleStartLoading = () => setIsLoading(true);
		const handleStopLoading = () => setIsLoading(false);
		const handleNavigate = (event: Event) => {
			const e = event as CustomEvent<{ url: string }>;
			if (e.detail?.url) {
				setCurrentUrl(e.detail.url);
			}
		};

		// Electron webview uses custom events
		webview.addEventListener("did-start-loading", handleStartLoading);
		webview.addEventListener("did-stop-loading", handleStopLoading);
		webview.addEventListener("did-navigate", handleNavigate);
		webview.addEventListener("did-navigate-in-page", handleNavigate);

		return () => {
			webview.removeEventListener("did-start-loading", handleStartLoading);
			webview.removeEventListener("did-stop-loading", handleStopLoading);
			webview.removeEventListener("did-navigate", handleNavigate);
			webview.removeEventListener("did-navigate-in-page", handleNavigate);
		};
	}, []);

	const handleNavigate = useCallback(
		(url: string) => {
			const webview = webviewRef.current as Electron.WebviewTag | null;
			if (webview) {
				webview.src = url;
				setCurrentUrl(url);
				agentScreenOperations.updatePane(
					collections.agentScreens,
					screenId,
					paneId,
					{ url },
				);
			}
		},
		[screenId, paneId, collections.agentScreens],
	);

	const handleRefresh = useCallback(() => {
		const webview = webviewRef.current as Electron.WebviewTag | null;
		webview?.reload();
	}, []);

	const handleClose = useCallback(() => {
		agentScreenOperations.removePane(
			collections.agentScreens,
			screenId,
			paneId,
		);
	}, [screenId, paneId, collections.agentScreens]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				handleNavigate(currentUrl);
			}
		},
		[currentUrl, handleNavigate],
	);

	return (
		<div className="w-full h-full flex flex-col bg-background">
			{/* Browser toolbar */}
			<div className="shrink-0 h-10 px-2 flex items-center gap-2 border-b border-border bg-muted/30">
				<HiGlobeAlt className="w-4 h-4 text-muted-foreground shrink-0" />
				<Input
					value={currentUrl}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
						setCurrentUrl(e.target.value)
					}
					onKeyDown={handleKeyDown}
					className="h-7 text-xs flex-1"
					placeholder="Enter URL..."
				/>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					onClick={handleRefresh}
					title="Refresh"
				>
					<HiArrowPath
						className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
					/>
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					onClick={handleClose}
					title="Close pane"
				>
					<HiXMark className="w-3.5 h-3.5" />
				</Button>
			</div>

			{/* Webview */}
			<div className="flex-1 relative">
				<webview ref={webviewRef} src={pane.url} className="w-full h-full" />
				{isLoading && (
					<div className="absolute inset-0 flex items-center justify-center bg-background/80">
						<HiArrowPath className="w-6 h-6 animate-spin text-muted-foreground" />
					</div>
				)}
			</div>
		</div>
	);
}
