import { useEffect, useRef } from "react";
import { LuCloud, LuExternalLink, LuRefreshCw, LuX } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { apiTrpc } from "renderer/lib/api-trpc";
import { ApiTRPCProvider } from "renderer/providers/ApiTRPCProvider";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useCloudWorkspaceStore } from "renderer/stores/cloud-workspace";

const STROKE_WIDTH = 1.5;

// Extend JSX to include webview element (Electron-specific)
declare global {
	namespace JSX {
		interface IntrinsicElements {
			webview: React.DetailedHTMLProps<
				React.HTMLAttributes<HTMLElement> & {
					src?: string;
					partition?: string;
					allowpopups?: boolean;
					webpreferences?: string;
				},
				HTMLElement
			>;
		}
	}
}

/**
 * Wrapper that provides the API tRPC context for cloud workspace view.
 */
export function CloudWorkspaceView() {
	return (
		<ApiTRPCProvider queryClient={electronQueryClient}>
			<CloudWorkspaceViewContent />
		</ApiTRPCProvider>
	);
}

function CloudWorkspaceViewContent() {
	const { activeSessionId, clearActiveSession } = useCloudWorkspaceStore();
	const webviewRef = useRef<HTMLElement>(null);

	const { data: workspace, isLoading } =
		apiTrpc.cloudWorkspace.getBySessionId.useQuery(
			{ sessionId: activeSessionId ?? "" },
			{ enabled: !!activeSessionId },
		);

	// Set up webview event listeners
	useEffect(() => {
		const webview = webviewRef.current;
		if (!webview) return;

		const handleDidFailLoad = (event: Event) => {
			const e = event as CustomEvent;
			console.error("[CloudWorkspaceView] Failed to load:", e.detail);
		};

		const handleDidFinishLoad = () => {
			console.log("[CloudWorkspaceView] Finished loading");
		};

		webview.addEventListener("did-fail-load", handleDidFailLoad);
		webview.addEventListener("did-finish-load", handleDidFinishLoad);

		return () => {
			webview.removeEventListener("did-fail-load", handleDidFailLoad);
			webview.removeEventListener("did-finish-load", handleDidFinishLoad);
		};
	}, []);

	if (!activeSessionId) {
		return null;
	}

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-3 text-muted-foreground">
					<LuCloud
						className="size-8 animate-pulse"
						strokeWidth={STROKE_WIDTH}
					/>
					<span className="text-sm">Loading cloud workspace...</span>
				</div>
			</div>
		);
	}

	if (!workspace) {
		return (
			<div className="flex-1 flex items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-3 text-muted-foreground">
					<LuCloud className="size-8" strokeWidth={STROKE_WIDTH} />
					<span className="text-sm">Cloud workspace not found</span>
					<button
						type="button"
						onClick={clearActiveSession}
						className="text-xs text-primary hover:underline"
					>
						Go back
					</button>
				</div>
			</div>
		);
	}

	// Build the cloud workspace URL
	// This will be the URL to the web app's cloud workspace page
	const cloudWorkspaceUrl = `${env.NEXT_PUBLIC_WEB_URL}/cloud/${workspace.sessionId}`;

	const handleRefresh = () => {
		const webview = webviewRef.current as
			| (HTMLElement & { reload?: () => void })
			| null;
		if (webview?.reload) {
			webview.reload();
		}
	};

	const handleOpenExternal = () => {
		window.open(cloudWorkspaceUrl, "_blank");
	};

	return (
		<div className="flex-1 flex flex-col h-full overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/80 backdrop-blur-sm">
				<LuCloud
					className="size-4 text-muted-foreground shrink-0"
					strokeWidth={STROKE_WIDTH}
				/>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium truncate">
							{workspace.title}
						</span>
						<span className="text-xs text-muted-foreground font-mono">
							{workspace.repoOwner}/{workspace.repoName}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={handleRefresh}
						className="p-1.5 hover:bg-muted rounded transition-colors"
						title="Refresh"
					>
						<LuRefreshCw
							className="size-3.5 text-muted-foreground"
							strokeWidth={STROKE_WIDTH}
						/>
					</button>
					<button
						type="button"
						onClick={handleOpenExternal}
						className="p-1.5 hover:bg-muted rounded transition-colors"
						title="Open in browser"
					>
						<LuExternalLink
							className="size-3.5 text-muted-foreground"
							strokeWidth={STROKE_WIDTH}
						/>
					</button>
					<button
						type="button"
						onClick={clearActiveSession}
						className="p-1.5 hover:bg-muted rounded transition-colors"
						title="Close"
					>
						<LuX
							className="size-3.5 text-muted-foreground"
							strokeWidth={STROKE_WIDTH}
						/>
					</button>
				</div>
			</div>

			{/* Electron WebView for external content */}
			<div className="flex-1 relative bg-background">
				<webview
					ref={webviewRef as React.RefObject<HTMLElement>}
					src={cloudWorkspaceUrl}
					partition="persist:superset"
					allowpopups={true}
					webpreferences="contextIsolation=yes"
					className="absolute inset-0 w-full h-full border-0"
					style={{ display: "flex" }}
				/>
			</div>
		</div>
	);
}
