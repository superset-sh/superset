"use client";

import {
	ChevronDownIcon,
	ChevronUpIcon,
	ExternalLinkIcon,
	Maximize2Icon,
	MinimizeIcon,
	RefreshCwIcon,
	XIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "../ui/collapsible";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";
import { Loader } from "./loader";

// =============================================================================
// Context
// =============================================================================

export type LivePreviewState = "loading" | "loaded" | "error" | "empty";

export type LivePreviewContextValue = {
	url: string;
	setUrl: (url: string) => void;
	state: LivePreviewState;
	setState: (state: LivePreviewState) => void;
	isExpanded: boolean;
	setIsExpanded: (expanded: boolean) => void;
	isCollapsed: boolean;
	setIsCollapsed: (collapsed: boolean) => void;
	refresh: () => void;
	refreshKey: number;
};

const LivePreviewContext = createContext<LivePreviewContextValue | null>(null);

const useLivePreview = () => {
	const context = useContext(LivePreviewContext);
	if (!context) {
		throw new Error("LivePreview components must be used within a LivePreview");
	}
	return context;
};

// =============================================================================
// Root Component
// =============================================================================

export type LivePreviewProps = ComponentProps<"div"> & {
	defaultUrl?: string;
	defaultCollapsed?: boolean;
	onUrlChange?: (url: string) => void;
	onExpandChange?: (expanded: boolean) => void;
};

export const LivePreview = ({
	className,
	children,
	defaultUrl = "",
	defaultCollapsed = false,
	onUrlChange,
	onExpandChange,
	...props
}: LivePreviewProps) => {
	const [url, setUrlState] = useState(defaultUrl);
	const [state, setState] = useState<LivePreviewState>(
		defaultUrl ? "loading" : "empty",
	);
	const [isExpanded, setIsExpandedState] = useState(false);
	const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
	const [refreshKey, setRefreshKey] = useState(0);

	const setUrl = useCallback(
		(newUrl: string) => {
			setUrlState(newUrl);
			setState(newUrl ? "loading" : "empty");
			onUrlChange?.(newUrl);
		},
		[onUrlChange],
	);

	const setIsExpanded = useCallback(
		(expanded: boolean) => {
			setIsExpandedState(expanded);
			onExpandChange?.(expanded);
		},
		[onExpandChange],
	);

	const refresh = useCallback(() => {
		setRefreshKey((k) => k + 1);
		if (url) setState("loading");
	}, [url]);

	// Sync url when defaultUrl changes
	useEffect(() => {
		if (defaultUrl !== url) {
			setUrlState(defaultUrl);
			setState(defaultUrl ? "loading" : "empty");
		}
	}, [defaultUrl, url]);

	// Handle escape key to close expanded view
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && isExpanded) {
				setIsExpanded(false);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isExpanded, setIsExpanded]);

	// Prevent body scroll when expanded
	useEffect(() => {
		if (isExpanded) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [isExpanded]);

	const contextValue: LivePreviewContextValue = {
		url,
		setUrl,
		state,
		setState,
		isExpanded,
		setIsExpanded,
		isCollapsed,
		setIsCollapsed,
		refresh,
		refreshKey,
	};

	return (
		<LivePreviewContext.Provider value={contextValue}>
			<div
				className={cn(
					"flex flex-col overflow-hidden rounded-lg border bg-card",
					className,
				)}
				{...props}
			>
				{children}
			</div>
		</LivePreviewContext.Provider>
	);
};

// =============================================================================
// Collapsible Wrapper (for inline chat use)
// =============================================================================

export type LivePreviewCollapsibleProps = ComponentProps<typeof Collapsible>;

export const LivePreviewCollapsible = ({
	className,
	children,
	...props
}: LivePreviewCollapsibleProps) => {
	const { isCollapsed, setIsCollapsed } = useLivePreview();

	return (
		<Collapsible
			className={cn("border-t", className)}
			onOpenChange={(open) => setIsCollapsed(!open)}
			open={!isCollapsed}
			{...props}
		>
			{children}
		</Collapsible>
	);
};

export type LivePreviewCollapsibleTriggerProps = ComponentProps<"button"> & {
	showUrl?: boolean;
};

export const LivePreviewCollapsibleTrigger = ({
	className,
	showUrl = true,
	children,
	...props
}: LivePreviewCollapsibleTriggerProps) => {
	const { url, isCollapsed, state } = useLivePreview();
	const isLive = state === "loaded" && url;

	return (
		<CollapsibleTrigger asChild>
			<button
				className={cn(
					"flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-muted/50",
					className,
				)}
				type="button"
				{...props}
			>
				{children ?? (
					<>
						<div className="flex items-center gap-2">
							{isLive && (
								<span className="relative flex size-2">
									<span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
									<span className="relative inline-flex size-2 rounded-full bg-green-500" />
								</span>
							)}
							<span className="font-medium text-sm">Live Preview</span>
							{showUrl && isCollapsed && url && (
								<span className="max-w-48 truncate text-muted-foreground text-xs">
									{url}
								</span>
							)}
						</div>
						<Button asChild className="size-6" size="icon" variant="ghost">
							<span>
								{isCollapsed ? (
									<ChevronUpIcon className="size-4" />
								) : (
									<ChevronDownIcon className="size-4" />
								)}
							</span>
						</Button>
					</>
				)}
			</button>
		</CollapsibleTrigger>
	);
};

export type LivePreviewCollapsibleContentProps = ComponentProps<
	typeof CollapsibleContent
>;

export const LivePreviewCollapsibleContent = ({
	className,
	children,
	...props
}: LivePreviewCollapsibleContentProps) => (
	<CollapsibleContent
		className={cn(
			"overflow-hidden transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
			className,
		)}
		{...props}
	>
		{children}
	</CollapsibleContent>
);

// =============================================================================
// Toolbar
// =============================================================================

export type LivePreviewToolbarProps = ComponentProps<"div">;

export const LivePreviewToolbar = ({
	className,
	children,
	...props
}: LivePreviewToolbarProps) => (
	<div
		className={cn(
			"flex items-center justify-between border-b bg-muted/50 px-2 py-1.5",
			className,
		)}
		{...props}
	>
		{children}
	</div>
);

export type LivePreviewBrowserDotsProps = ComponentProps<"div">;

export const LivePreviewBrowserDots = ({
	className,
	...props
}: LivePreviewBrowserDotsProps) => (
	<div className={cn("flex gap-1", className)} {...props}>
		<div className="size-2 rounded-full bg-red-400" />
		<div className="size-2 rounded-full bg-yellow-400" />
		<div className="size-2 rounded-full bg-green-400" />
	</div>
);

export type LivePreviewUrlBarProps = ComponentProps<"div">;

export const LivePreviewUrlBar = ({
	className,
	...props
}: LivePreviewUrlBarProps) => {
	const { url } = useLivePreview();

	return (
		<div
			className={cn(
				"flex max-w-48 items-center truncate rounded bg-background px-2 py-0.5 text-muted-foreground text-xs",
				className,
			)}
			{...props}
		>
			{url ? (
				<span className="truncate">{url}</span>
			) : (
				<span className="italic">No preview</span>
			)}
		</div>
	);
};

export type LivePreviewActionsProps = ComponentProps<"div">;

export const LivePreviewActions = ({
	className,
	children,
	...props
}: LivePreviewActionsProps) => (
	<div className={cn("flex items-center gap-1", className)} {...props}>
		{children}
	</div>
);

export type LivePreviewActionProps = ComponentProps<typeof Button> & {
	tooltip?: string;
};

export const LivePreviewAction = ({
	tooltip,
	children,
	className,
	size = "icon",
	variant = "ghost",
	...props
}: LivePreviewActionProps) => {
	const button = (
		<Button
			className={cn("size-6", className)}
			size={size}
			type="button"
			variant={variant}
			{...props}
		>
			{children}
		</Button>
	);

	if (tooltip) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>{button}</TooltipTrigger>
					<TooltipContent>
						<p>{tooltip}</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return button;
};

export const LivePreviewRefreshAction = (
	props: Omit<LivePreviewActionProps, "onClick" | "children">,
) => {
	const { refresh } = useLivePreview();

	return (
		<LivePreviewAction onClick={refresh} tooltip="Refresh preview" {...props}>
			<RefreshCwIcon className="size-3" />
		</LivePreviewAction>
	);
};

export const LivePreviewOpenAction = (
	props: Omit<LivePreviewActionProps, "onClick" | "children">,
) => {
	const { url } = useLivePreview();

	const handleClick = useCallback(() => {
		if (url) {
			window.open(url, "_blank", "noopener,noreferrer");
		}
	}, [url]);

	if (!url) return null;

	return (
		<LivePreviewAction
			onClick={handleClick}
			tooltip="Open in new tab"
			{...props}
		>
			<ExternalLinkIcon className="size-3" />
		</LivePreviewAction>
	);
};

export const LivePreviewExpandAction = (
	props: Omit<LivePreviewActionProps, "onClick" | "children">,
) => {
	const { url, isExpanded, setIsExpanded } = useLivePreview();

	if (!url) return null;

	return (
		<LivePreviewAction
			onClick={() => setIsExpanded(!isExpanded)}
			tooltip={isExpanded ? "Exit fullscreen (Esc)" : "Expand preview"}
			{...props}
		>
			{isExpanded ? (
				<MinimizeIcon className="size-3" />
			) : (
				<Maximize2Icon className="size-3" />
			)}
		</LivePreviewAction>
	);
};

// =============================================================================
// Body / Frame
// =============================================================================

export type LivePreviewFrameProps = ComponentProps<"div"> & {
	aspectRatio?: "video" | "square" | "auto";
};

export const LivePreviewFrame = ({
	className,
	aspectRatio = "video",
	children,
	...props
}: LivePreviewFrameProps) => {
	const { url, state, setState, refreshKey } = useLivePreview();
	const iframeRef = useRef<HTMLIFrameElement>(null);

	const handleLoad = useCallback(() => {
		setState("loaded");
	}, [setState]);

	const handleError = useCallback(() => {
		setState("error");
	}, [setState]);

	return (
		<div
			className={cn(
				"relative overflow-hidden bg-white",
				aspectRatio === "video" && "aspect-video",
				aspectRatio === "square" && "aspect-square",
				aspectRatio === "auto" && "min-h-48 flex-1",
				className,
			)}
			{...props}
		>
			{state === "empty" && <LivePreviewEmpty />}
			{state === "loading" && url && <LivePreviewLoading />}
			{state === "error" && <LivePreviewError />}
			{url && (
				<iframe
					ref={iframeRef}
					key={refreshKey}
					className={cn(
						"size-full",
						state !== "loaded" && "invisible absolute",
					)}
					onError={handleError}
					onLoad={handleLoad}
					sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
					src={url}
					title="Live Preview"
				/>
			)}
			{children}
		</div>
	);
};

// =============================================================================
// States
// =============================================================================

export type LivePreviewEmptyProps = ComponentProps<"div"> & {
	icon?: ReactNode;
	title?: string;
	description?: string;
};

export const LivePreviewEmpty = ({
	className,
	icon,
	title = "No preview available",
	description = "Start a task to see live results",
	...props
}: LivePreviewEmptyProps) => (
	<div
		className={cn(
			"flex h-full flex-col items-center justify-center gap-2 bg-muted/30 p-4",
			className,
		)}
		{...props}
	>
		{icon ?? (
			<div className="rounded-lg bg-muted p-3">
				<svg
					className="size-8 text-muted-foreground"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					viewBox="0 0 24 24"
				>
					<path
						d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</div>
		)}
		<span className="text-muted-foreground text-sm">{title}</span>
		<span className="text-muted-foreground/60 text-xs">{description}</span>
	</div>
);

export type LivePreviewLoadingProps = ComponentProps<"div">;

export const LivePreviewLoading = ({
	className,
	...props
}: LivePreviewLoadingProps) => (
	<div
		className={cn(
			"flex h-full flex-col items-center justify-center gap-3 bg-muted/20",
			className,
		)}
		{...props}
	>
		<Loader size={24} />
		<div className="space-y-1 text-center">
			<span className="text-muted-foreground text-sm">Loading preview...</span>
		</div>
	</div>
);

export type LivePreviewErrorProps = ComponentProps<"div"> & {
	onRetry?: () => void;
};

export const LivePreviewError = ({
	className,
	onRetry,
	...props
}: LivePreviewErrorProps) => {
	const { url, refresh } = useLivePreview();

	return (
		<div
			className={cn(
				"flex h-full flex-col items-center justify-center gap-3 bg-red-50/50 p-4",
				className,
			)}
			{...props}
		>
			<div className="rounded-lg bg-red-100 p-3">
				<svg
					className="size-8 text-red-500"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					viewBox="0 0 24 24"
				>
					<path
						d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</div>
			<div className="space-y-1 text-center">
				<span className="font-medium text-red-700 text-sm">
					Failed to load preview
				</span>
				{url && (
					<p className="max-w-48 truncate text-red-600/70 text-xs">{url}</p>
				)}
			</div>
			<Button onClick={onRetry ?? refresh} size="sm" variant="outline">
				<RefreshCwIcon className="mr-1.5 size-3" />
				Retry
			</Button>
		</div>
	);
};

// =============================================================================
// Fullscreen Modal
// =============================================================================

export type LivePreviewFullscreenProps = ComponentProps<"div">;

export const LivePreviewFullscreen = ({
	className,
	children,
	...props
}: LivePreviewFullscreenProps) => {
	const { isExpanded, setIsExpanded } = useLivePreview();

	if (!isExpanded) return null;

	return (
		<div
			className={cn(
				"fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm",
				"animate-in fade-in-0 zoom-in-95",
				className,
			)}
			{...props}
		>
			<Button
				className="absolute top-4 right-4 z-10"
				onClick={() => setIsExpanded(false)}
				size="icon"
				variant="ghost"
			>
				<XIcon className="size-5" />
			</Button>
			<div className="flex-1 p-4">{children}</div>
		</div>
	);
};
