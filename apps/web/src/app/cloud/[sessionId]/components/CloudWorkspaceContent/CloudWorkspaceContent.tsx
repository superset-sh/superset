"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Card, CardContent } from "@superset/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	LuArchive,
	LuArrowUp,
	LuCheck,
	LuEllipsis,
	LuExternalLink,
	LuFile,
	LuGitBranch,
	LuGithub,
	LuGitPullRequest,
	LuGlobe,
	LuLoader,
	LuPanelLeftClose,
	LuPanelLeftOpen,
	LuPencil,
	LuPlus,
	LuSquare,
	LuTerminal,
	LuWifi,
	LuWifiOff,
	LuX,
} from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { env } from "@/env";
import { useTRPC } from "@/trpc/react";
import {
	type Artifact,
	type CloudEvent,
	type FileChange,
	type ParticipantPresence,
	useCloudSession,
} from "../../hooks";
import { ToolCallGroup } from "../ToolCallGroup";

type GroupedEvent =
	| { type: "assistant_message"; id: string; text: string }
	| { type: "user_message"; id: string; content: string }
	| {
			type: "tool_call_group";
			id: string;
			events: CloudEvent[];
			toolName: string;
	  }
	| { type: "other"; event: CloudEvent };

function groupEvents(events: CloudEvent[]): GroupedEvent[] {
	const result: GroupedEvent[] = [];
	let currentTokenGroup: { id: string; tokens: string[] } | null = null;
	let currentToolGroup: {
		id: string;
		events: CloudEvent[];
		toolName: string;
	} | null = null;

	const flushTokens = () => {
		if (currentTokenGroup) {
			result.push({
				type: "assistant_message",
				id: currentTokenGroup.id,
				text: currentTokenGroup.tokens.join(""),
			});
			currentTokenGroup = null;
		}
	};

	const flushTools = () => {
		if (currentToolGroup) {
			result.push({
				type: "tool_call_group",
				id: currentToolGroup.id,
				events: currentToolGroup.events,
				toolName: currentToolGroup.toolName,
			});
			currentToolGroup = null;
		}
	};

	for (const event of events) {
		if (event.type === "heartbeat") continue;

		if (event.type === "user_message") {
			flushTokens();
			flushTools();
			const data = event.data as { content?: string };
			result.push({
				type: "user_message",
				id: event.id,
				content: data.content || "",
			});
		} else if (event.type === "token") {
			flushTools();
			// OpenCode sends cumulative content, not individual tokens
			const data = event.data as { content?: string; token?: string };
			const text = data.content || data.token;
			if (text) {
				// Since content is cumulative, we replace rather than append
				if (!currentTokenGroup) {
					currentTokenGroup = { id: event.id, tokens: [] };
				}
				// Clear previous tokens and set the cumulative text
				currentTokenGroup.tokens = [text];
			}
		} else if (event.type === "tool_call") {
			flushTokens();
			const data = event.data as { name?: string };
			const toolName = data.name || "Unknown";

			if (currentToolGroup && currentToolGroup.toolName === toolName) {
				currentToolGroup.events.push(event);
			} else {
				flushTools();
				currentToolGroup = {
					id: event.id,
					events: [event],
					toolName,
				};
			}
		} else {
			flushTokens();
			flushTools();
			result.push({ type: "other", event });
		}
	}

	flushTokens();
	flushTools();

	return result;
}

interface CloudWorkspace {
	id: string;
	sessionId: string;
	title: string;
	repoOwner: string;
	repoName: string;
	branch: string;
	baseBranch: string;
	status: string;
	sandboxStatus: string | null;
	model: string | null;
	linearIssueKey: string | null;
	prUrl: string | null;
	prNumber: number | null;
	createdAt: Date;
	updatedAt: Date;
}

interface CloudWorkspaceContentProps {
	workspace: CloudWorkspace;
	workspaces: CloudWorkspace[];
}

function SupersetLogo({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 392 64"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-label="Superset"
			className={className}
		>
			<path
				d="M25.2727 -0.00017944H37.9091V12.6362H25.2727V-0.00017944ZM12.6364 -0.00017944H25.2727V12.6362H12.6364V-0.00017944ZM0 12.6362H12.6364V25.2725H0V12.6362ZM0 25.2725H12.6364V37.9089H0V25.2725ZM12.6364 25.2725H25.2727V37.9089H12.6364V25.2725ZM25.2727 25.2725H37.9091V37.9089H25.2727V25.2725ZM25.2727 37.9089H37.9091V50.5453H25.2727V37.9089ZM25.2727 50.5453H37.9091V63.1816H25.2727V50.5453ZM12.6364 50.5453H25.2727V63.1816H12.6364V50.5453ZM0 50.5453H12.6364V63.1816H0V50.5453ZM0 -0.00017944H12.6364V12.6362H0V-0.00017944ZM50.4961 -0.00017944H63.1325V12.6362H50.4961V-0.00017944ZM50.4961 12.6362H63.1325V25.2725H50.4961V12.6362ZM50.4961 25.2725H63.1325V37.9089H50.4961V25.2725ZM50.4961 37.9089H63.1325V50.5453H50.4961V37.9089ZM50.4961 50.5453H63.1325V63.1816H50.4961V50.5453ZM63.1325 50.5453H75.7688V63.1816H63.1325V50.5453ZM75.7688 50.5453H88.4052V63.1816H75.7688V50.5453ZM75.7688 37.9089H88.4052V50.5453H75.7688V37.9089ZM75.7688 25.2725H88.4052V37.9089H75.7688V25.2725ZM75.7688 12.6362H88.4052V25.2725H75.7688V12.6362ZM75.7688 -0.00017944H88.4052V12.6362H75.7688V-0.00017944ZM100.992 -0.00017944H113.629V12.6362H100.992V-0.00017944ZM100.992 12.6362H113.629V25.2725H100.992V12.6362ZM100.992 25.2725H113.629V37.9089H100.992V25.2725ZM100.992 37.9089H113.629V50.5453H100.992V37.9089ZM100.992 50.5453H113.629V63.1816H100.992V50.5453ZM113.629 -0.00017944H126.265V12.6362H113.629V-0.00017944ZM126.265 -0.00017944H138.901V12.6362H126.265V-0.00017944ZM126.265 12.6362H138.901V25.2725H126.265V12.6362ZM126.265 25.2725H138.901V37.9089H126.265V25.2725ZM113.629 25.2725H126.265V37.9089H113.629V25.2725ZM151.488 -0.00017944H164.125V12.6362H151.488V-0.00017944ZM151.488 12.6362H164.125V25.2725H151.488V12.6362ZM151.488 25.2725H164.125V37.9089H151.488V25.2725ZM151.488 37.9089H164.125V50.5453H151.488V37.9089ZM151.488 50.5453H164.125V63.1816H151.488V50.5453ZM164.125 -0.00017944H176.761V12.6362H164.125V-0.00017944ZM164.125 50.5453H176.761V63.1816H164.125V50.5453ZM164.125 25.2725H176.761V37.9089H164.125V25.2725ZM176.761 -0.00017944H189.397V12.6362H176.761V-0.00017944ZM176.761 50.5453H189.397V63.1816H176.761V50.5453ZM201.984 50.5453H214.621V63.1816H201.984V50.5453ZM201.984 37.9089H214.621V50.5453H201.984V37.9089ZM201.984 25.2725H214.621V37.9089H201.984V25.2725ZM201.984 12.6362H214.621V25.2725H201.984V12.6362ZM201.984 -0.00017944H214.621V12.6362H201.984V-0.00017944ZM214.621 -0.00017944H227.257V12.6362H214.621V-0.00017944ZM227.257 -0.00017944H239.893V12.6362H227.257V-0.00017944ZM227.257 12.6362H239.893V25.2725H227.257V12.6362ZM214.621 25.2725H227.257V37.9089H214.621V25.2725ZM227.257 37.9089H239.893V50.5453H227.257V37.9089ZM227.257 50.5453H239.893V63.1816H227.257V50.5453ZM277.753 -0.00017944H290.39V12.6362H277.753V-0.00017944ZM265.117 -0.00017944H277.753V12.6362H265.117V-0.00017944ZM252.48 12.6362H265.117V25.2725H252.48V12.6362ZM252.48 25.2725H265.117V37.9089H252.48V25.2725ZM265.117 25.2725H277.753V37.9089H265.117V25.2725ZM277.753 25.2725H290.39V37.9089H277.753V25.2725ZM277.753 37.9089H290.39V50.5453H277.753V37.9089ZM277.753 50.5453H290.39V63.1816H277.753V50.5453ZM265.117 50.5453H277.753V63.1816H265.117V50.5453ZM252.48 50.5453H265.117V63.1816H252.48V50.5453ZM252.48 -0.00017944H265.117V12.6362H252.48V-0.00017944ZM302.977 -0.00017944H315.613V12.6362H302.977V-0.00017944ZM302.977 12.6362H315.613V25.2725H302.977V12.6362ZM302.977 25.2725H315.613V37.9089H302.977V25.2725ZM302.977 37.9089H315.613V50.5453H302.977V37.9089ZM302.977 50.5453H315.613V63.1816H302.977V50.5453ZM315.613 -0.00017944H328.249V12.6362H315.613V-0.00017944ZM315.613 50.5453H328.249V63.1816H315.613V50.5453ZM315.613 25.2725H328.249V37.9089H315.613V25.2725ZM328.249 -0.00017944H340.886V12.6362H328.249V-0.00017944ZM328.249 50.5453H340.886V63.1816H328.249V50.5453ZM353.473 -0.00017944H366.109V12.6362H353.473V-0.00017944ZM366.109 -0.00017944H378.745V12.6362H366.109V-0.00017944ZM378.745 -0.00017944H391.382V12.6362H378.745V-0.00017944ZM366.109 12.6362H378.745V25.2725H366.109V12.6362ZM366.109 25.2725H378.745V37.9089H366.109V25.2725ZM366.109 37.9089H378.745V50.5453H366.109V37.9089ZM366.109 50.5453H378.745V63.1816H366.109V50.5453Z"
				fill="currentColor"
			/>
		</svg>
	);
}

function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diff = now.getTime() - new Date(date).getTime();
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d`;
	if (hours > 0) return `${hours}h`;
	if (minutes > 0) return `${minutes}m`;
	return "now";
}

function isInactive(date: Date): boolean {
	const now = new Date();
	const diff = now.getTime() - new Date(date).getTime();
	const days = diff / (1000 * 60 * 60 * 24);
	return days > 7;
}

const CONTROL_PLANE_URL =
	env.NEXT_PUBLIC_CONTROL_PLANE_URL ||
	"https://superset-control-plane.avi-6ac.workers.dev";

export function CloudWorkspaceContent({
	workspace,
	workspaces: initialWorkspaces,
}: CloudWorkspaceContentProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const searchParams = useSearchParams();
	const _queryClient = useQueryClient();
	const initialPromptRef = useRef<string | null>(null);
	const hasSentInitialPrompt = useRef(false);

	// Poll for workspace list to get updated sandbox statuses for all sessions
	const { data: polledWorkspaces } = useQuery({
		...trpc.cloudWorkspace.list.queryOptions(),
		// Refetch every 30 seconds to get updated sandbox statuses
		refetchInterval: 30000,
		// Start with stale time of 0 to fetch immediately but use server data until then
		staleTime: 0,
	});

	// Use polled data if available, otherwise fall back to initial server data
	// Map the polled data to match our CloudWorkspace interface
	const workspaces = useMemo(() => {
		if (polledWorkspaces) {
			return polledWorkspaces.map((w) => ({
				id: w.id,
				sessionId: w.sessionId,
				title: w.title,
				repoOwner: w.repoOwner,
				repoName: w.repoName,
				branch: w.branch,
				baseBranch: w.baseBranch,
				status: w.status,
				sandboxStatus: w.sandboxStatus,
				model: w.model,
				linearIssueKey: w.linearIssueKey,
				prUrl: w.prUrl,
				prNumber: w.prNumber,
				createdAt: w.createdAt,
				updatedAt: w.updatedAt,
			}));
		}
		return initialWorkspaces;
	}, [polledWorkspaces, initialWorkspaces]);

	const [promptInput, setPromptInput] = useState("");
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editedTitle, setEditedTitle] = useState(workspace.title);
	const [isMounted, setIsMounted] = useState(false);
	const [showArchiveDialog, setShowArchiveDialog] = useState(false);
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const titleInputRef = useRef<HTMLInputElement>(null);

	// Track hydration to avoid Radix ID mismatch
	useEffect(() => {
		setIsMounted(true);
	}, []);

	// Update title mutation
	const updateMutation = useMutation(
		trpc.cloudWorkspace.update.mutationOptions({
			onSuccess: () => {
				setIsEditingTitle(false);
				// Refresh the page to get updated server data (sidebar uses server-fetched data)
				router.refresh();
			},
		}),
	);

	// Archive mutation
	const archiveMutation = useMutation(
		trpc.cloudWorkspace.archive.mutationOptions({
			onSuccess: () => {
				router.push("/cloud");
			},
		}),
	);

	const handleTitleSave = useCallback(() => {
		if (editedTitle.trim() && editedTitle !== workspace.title) {
			updateMutation.mutate({ id: workspace.id, title: editedTitle.trim() });
		} else {
			setIsEditingTitle(false);
			setEditedTitle(workspace.title);
		}
	}, [editedTitle, workspace.title, workspace.id, updateMutation]);

	const handleTitleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				handleTitleSave();
			} else if (e.key === "Escape") {
				setIsEditingTitle(false);
				setEditedTitle(workspace.title);
			}
		},
		[handleTitleSave, workspace.title],
	);

	const handleArchive = useCallback(() => {
		archiveMutation.mutate({ id: workspace.id });
	}, [archiveMutation, workspace.id]);

	// Focus title input when editing starts
	useEffect(() => {
		if (isEditingTitle && titleInputRef.current) {
			titleInputRef.current.focus();
			titleInputRef.current.select();
		}
	}, [isEditingTitle]);

	const {
		isConnected,
		isConnecting,
		isReconnecting,
		reconnectAttempt,
		isLoadingHistory,
		isSpawning,
		isProcessing,
		isSandboxReady,
		isControlPlaneAvailable,
		spawnAttempt,
		maxSpawnAttempts,
		error,
		sessionState,
		events,
		pendingPrompts,
		sendPrompt,
		sendStop,
		sendTyping,
		spawnSandbox,
		clearError,
	} = useCloudSession({
		controlPlaneUrl: CONTROL_PLANE_URL,
		sessionId: workspace.sessionId,
	});

	const isExecuting = isProcessing || sessionState?.sandboxStatus === "running";
	const canSendPrompt = isConnected && isSandboxReady && !isProcessing;

	// Auto-scroll to bottom when new events arrive
	useEffect(() => {
		if (scrollAreaRef.current) {
			const scrollContainer = scrollAreaRef.current.querySelector(
				"[data-radix-scroll-area-viewport]",
			);
			if (scrollContainer) {
				scrollContainer.scrollTop = scrollContainer.scrollHeight;
			}
		}
	}, []);

	const handleSendPrompt = useCallback(() => {
		if (promptInput.trim() && canSendPrompt) {
			sendPrompt(promptInput.trim());
			setPromptInput("");
			textareaRef.current?.focus();
		}
	}, [promptInput, canSendPrompt, sendPrompt]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSendPrompt();
			}
		},
		[handleSendPrompt],
	);

	// Global keyboard shortcuts
	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
			const modKey = isMac ? e.metaKey : e.ctrlKey;

			// ⌘+Enter or Ctrl+Enter to send prompt
			if (modKey && e.key === "Enter") {
				e.preventDefault();
				handleSendPrompt();
				return;
			}

			// Escape to stop execution
			if (e.key === "Escape" && isExecuting) {
				e.preventDefault();
				sendStop();
				return;
			}

			// ⌘+K or Ctrl+K to focus input
			if (modKey && e.key === "k") {
				e.preventDefault();
				textareaRef.current?.focus();
				return;
			}

			// ⌘+\ or Ctrl+\ to toggle sidebar
			if (modKey && e.key === "\\") {
				e.preventDefault();
				setSidebarOpen((prev) => !prev);
				return;
			}
		};

		window.addEventListener("keydown", handleGlobalKeyDown);
		return () => window.removeEventListener("keydown", handleGlobalKeyDown);
	}, [handleSendPrompt, isExecuting, sendStop]);

	// Auto-send initial prompt from URL when sandbox is ready
	useEffect(() => {
		// Capture initial prompt from URL on mount
		if (initialPromptRef.current === null) {
			const prompt = searchParams.get("prompt");
			initialPromptRef.current = prompt || "";

			// If there's a prompt, pre-populate the input
			if (prompt) {
				setPromptInput(prompt);
				// Clear the URL param to avoid re-sending on refresh
				router.replace(`/cloud/${workspace.sessionId}`, { scroll: false });
			}
		}
	}, [searchParams, router, workspace.sessionId]);

	// Send initial prompt when sandbox becomes ready
	useEffect(() => {
		if (
			isSandboxReady &&
			isConnected &&
			!hasSentInitialPrompt.current &&
			initialPromptRef.current &&
			initialPromptRef.current.trim()
		) {
			hasSentInitialPrompt.current = true;
			const prompt = initialPromptRef.current;
			console.log(
				"[cloud-workspace] Auto-sending initial prompt:",
				prompt.substring(0, 50),
			);
			sendPrompt(prompt);
			setPromptInput("");
		}
	}, [isSandboxReady, isConnected, sendPrompt]);

	const groupedEvents = useMemo(() => groupEvents(events), [events]);

	const filteredWorkspaces = useMemo(() => {
		if (!searchQuery.trim()) return workspaces;
		const query = searchQuery.toLowerCase();
		return workspaces.filter(
			(w) =>
				w.title?.toLowerCase().includes(query) ||
				`${w.repoOwner}/${w.repoName}`.toLowerCase().includes(query),
		);
	}, [workspaces, searchQuery]);

	const activeWorkspaces = useMemo(
		() => filteredWorkspaces.filter((w) => !isInactive(w.updatedAt)),
		[filteredWorkspaces],
	);

	const inactiveWorkspaces = useMemo(
		() => filteredWorkspaces.filter((w) => isInactive(w.updatedAt)),
		[filteredWorkspaces],
	);

	return (
		<div className="flex h-screen bg-background">
			{/* Sidebar */}
			<aside
				className={cn(
					"border-r flex flex-col bg-background transition-all duration-200",
					sidebarOpen ? "w-64" : "w-0 overflow-hidden",
				)}
			>
				{/* Header */}
				<div className="h-14 px-4 flex items-center justify-between border-b">
					<div className="flex items-center gap-2">
						<Link href="/cloud">
							<SupersetLogo className="h-4" />
						</Link>
					</div>
					<Button variant="ghost" size="icon" className="size-8" asChild>
						<Link href="/cloud/new">
							<LuPlus className="size-4" />
						</Link>
					</Button>
				</div>

				{/* Search */}
				<div className="px-3 py-2">
					<Input
						placeholder="Search sessions..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="h-8 text-sm bg-muted/50 border-0"
					/>
				</div>

				{/* Session list */}
				<ScrollArea className="flex-1">
					{filteredWorkspaces.length === 0 ? (
						<div className="px-4 py-8 text-center text-muted-foreground text-sm">
							{searchQuery ? "No sessions found" : "No sessions yet"}
						</div>
					) : (
						<div className="px-2 py-1">
							{/* Active sessions */}
							{activeWorkspaces.map((w) => (
								<SessionListItem
									key={w.id}
									workspace={w}
									isActive={w.sessionId === workspace.sessionId}
									realtimeSandboxStatus={
										w.sessionId === workspace.sessionId
											? sessionState?.sandboxStatus
											: undefined
									}
								/>
							))}

							{/* Inactive sessions */}
							{inactiveWorkspaces.length > 0 && (
								<>
									<div className="px-2 py-2 mt-2 text-xs text-muted-foreground">
										Inactive
									</div>
									{inactiveWorkspaces.map((w) => (
										<SessionListItem
											key={w.id}
											workspace={w}
											isActive={w.sessionId === workspace.sessionId}
											realtimeSandboxStatus={
												w.sessionId === workspace.sessionId
													? sessionState?.sandboxStatus
													: undefined
											}
										/>
									))}
								</>
							)}
						</div>
					)}
				</ScrollArea>
			</aside>

			{/* Main content */}
			<div className="flex-1 flex flex-col min-w-0">
				{/* Header */}
				<header className="h-14 flex items-center gap-3 border-b px-4">
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						onClick={() => setSidebarOpen(!sidebarOpen)}
					>
						{sidebarOpen ? (
							<LuPanelLeftClose className="size-4" />
						) : (
							<LuPanelLeftOpen className="size-4" />
						)}
					</Button>
					<div className="flex-1 min-w-0">
						{isEditingTitle ? (
							<div className="flex items-center gap-1">
								<Input
									ref={titleInputRef}
									value={editedTitle}
									onChange={(e) => setEditedTitle(e.target.value)}
									onKeyDown={handleTitleKeyDown}
									onBlur={handleTitleSave}
									className="h-7 text-sm font-semibold"
									disabled={updateMutation.isPending}
								/>
								{updateMutation.isPending && (
									<LuLoader className="size-4 animate-spin" />
								)}
							</div>
						) : (
							<button
								type="button"
								onClick={() => setIsEditingTitle(true)}
								className="text-sm font-semibold truncate hover:text-muted-foreground transition-colors text-left w-full flex items-center gap-1 group"
							>
								<span className="truncate">{workspace.title}</span>
								<LuPencil className="size-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
							</button>
						)}
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<LuGithub className="size-3" />
							<span className="truncate">
								{workspace.repoOwner}/{workspace.repoName}
							</span>
							<LuGitBranch className="size-3" />
							<span className="truncate">{workspace.branch}</span>
						</div>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{/* Connection status */}
						<Badge
							variant={isConnected ? "default" : "secondary"}
							className="gap-1"
						>
							{isConnecting || isReconnecting ? (
								<LuLoader className="size-3 animate-spin" />
							) : isConnected ? (
								<LuWifi className="size-3" />
							) : (
								<LuWifiOff className="size-3" />
							)}
							{isReconnecting
								? `Reconnecting (${reconnectAttempt}/5)...`
								: isConnecting
									? "Connecting..."
									: isConnected
										? "Connected"
										: "Disconnected"}
						</Badge>
						<Badge variant="outline">{workspace.status}</Badge>
						{(sessionState?.sandboxStatus ||
							workspace.sandboxStatus ||
							isSpawning) && (
							<Badge
								variant={
									(sessionState?.sandboxStatus || workspace.sandboxStatus) ===
									"ready"
										? "default"
										: "secondary"
								}
								className="gap-1"
							>
								{(isSpawning ||
									sessionState?.sandboxStatus === "warming" ||
									sessionState?.sandboxStatus === "syncing") && (
									<LuLoader className="size-3 animate-spin" />
								)}
								{isSpawning
									? spawnAttempt > 0
										? `Spawning (${spawnAttempt + 1}/${maxSpawnAttempts})...`
										: "Spawning..."
									: sessionState?.sandboxStatus === "warming"
										? "Warming..."
										: sessionState?.sandboxStatus || workspace.sandboxStatus}
							</Badge>
						)}
						{/* Artifacts - PR and Preview links */}
						{sessionState?.artifacts && sessionState.artifacts.length > 0 && (
							<div className="flex items-center gap-1">
								{sessionState.artifacts.map((artifact) => (
									<ArtifactButton key={artifact.id} artifact={artifact} />
								))}
							</div>
						)}
						{/* Files changed indicator */}
						{sessionState?.filesChanged &&
							sessionState.filesChanged.length > 0 &&
							isMounted && (
								<FilesChangedDropdown files={sessionState.filesChanged} />
							)}
						{/* Participant avatars */}
						{sessionState?.participants &&
							sessionState.participants.length > 0 && (
								<ParticipantAvatars participants={sessionState.participants} />
							)}
						{/* Session menu - only render after hydration to avoid Radix ID mismatch */}
						{isMounted ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" className="size-8">
										<LuEllipsis className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onClick={() => setIsEditingTitle(true)}>
										<LuPencil className="size-4 mr-2" />
										Rename
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onClick={() => setShowArchiveDialog(true)}
										className="text-destructive focus:text-destructive"
									>
										<LuArchive className="size-4 mr-2" />
										Archive Session
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<Button variant="ghost" size="icon" className="size-8">
								<LuEllipsis className="size-4" />
							</Button>
						)}
					</div>
				</header>

				{/* Main content area */}
				<main className="flex min-h-0 flex-1 flex-col">
					{/* Events display */}
					<ScrollArea ref={scrollAreaRef} className="flex-1 h-full">
						<div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
							{events.length === 0 && !error && (
								<div className="flex flex-col items-center justify-center py-12 text-center">
									<div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
										<LuTerminal className="size-5 text-muted-foreground" />
									</div>
									<h3 className="text-sm font-medium text-foreground mb-1">
										{isSpawning
											? "Starting cloud sandbox..."
											: isConnected
												? sessionState?.sandboxStatus === "ready"
													? "Ready to start"
													: "Preparing workspace..."
												: isConnecting
													? "Connecting..."
													: "Waiting for connection..."}
									</h3>
									<p className="text-xs text-muted-foreground max-w-xs">
										{isSpawning
											? "This may take a moment"
											: isConnected && sessionState?.sandboxStatus === "ready"
												? "Send a message to start working with Claude"
												: "Please wait while we set things up"}
									</p>
								</div>
							)}

							{isLoadingHistory && isConnected && events.length === 0 && (
								<div className="flex items-center justify-center py-4">
									<LuLoader className="size-5 animate-spin text-muted-foreground" />
									<span className="ml-2 text-sm text-muted-foreground">
										Loading history...
									</span>
								</div>
							)}

							{groupedEvents.map((grouped, index) => {
								if (grouped.type === "user_message") {
									return (
										<UserMessage
											key={`user-${index}-${grouped.id}`}
											content={grouped.content}
										/>
									);
								}
								if (grouped.type === "assistant_message") {
									return (
										<AssistantMessage
											key={`assistant-${index}-${grouped.id}`}
											text={grouped.text}
										/>
									);
								}
								if (grouped.type === "tool_call_group") {
									return (
										<div
											key={`tools-${index}-${grouped.id}`}
											className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2"
										>
											<ToolCallGroup
												events={grouped.events}
												groupId={grouped.id}
											/>
										</div>
									);
								}
								return (
									<EventItem
										key={`event-${index}-${grouped.event.id}`}
										event={grouped.event}
									/>
								);
							})}
							{/* Processing indicator */}
							{isProcessing && (
								<div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-muted/40 border border-border/50">
									<div className="relative flex items-center justify-center">
										<div className="size-2 rounded-full bg-primary animate-pulse" />
										<div className="absolute size-4 rounded-full border-2 border-primary/30 animate-ping" />
									</div>
									<span className="text-sm text-muted-foreground font-medium animate-pulse">
										Claude is thinking...
									</span>
								</div>
							)}
						</div>
					</ScrollArea>
				</main>

				{/* Prompt input - sticky at bottom */}
				<div className="sticky bottom-0 px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent relative z-10">
					<div className="max-w-3xl mx-auto">
						<div className="relative">
							<Textarea
								ref={textareaRef}
								value={promptInput}
								onChange={(e) => {
									setPromptInput(e.target.value);
									// Trigger sandbox pre-warming on first keystroke
									if (e.target.value.length > 0) {
										sendTyping();
									}
								}}
								onKeyDown={handleKeyDown}
								placeholder={
									!isConnected
										? "Connecting to cloud workspace..."
										: isSpawning
											? "Starting sandbox..."
											: sessionState?.sandboxStatus === "syncing"
												? "Syncing repository..."
												: !isSandboxReady
													? "Waiting for sandbox..."
													: isProcessing
														? "Processing..."
														: "What do you want to build?"
								}
								disabled={!canSendPrompt}
								rows={1}
								className="min-h-[52px] max-h-[200px] resize-none pr-14 rounded-xl border-border bg-background shadow-sm focus-visible:ring-1 focus-visible:ring-primary/50"
							/>
							<div className="absolute right-2 bottom-2 flex items-center gap-1">
								{isExecuting ? (
									<Button
										variant="destructive"
										size="icon"
										onClick={sendStop}
										disabled={!isConnected}
										className="size-8 rounded-lg shrink-0"
									>
										<LuSquare className="size-4" />
									</Button>
								) : (
									<Button
										onClick={handleSendPrompt}
										disabled={!canSendPrompt || !promptInput.trim()}
										size="icon"
										className="size-8 rounded-lg shrink-0 bg-foreground text-background hover:bg-foreground/90"
									>
										{!isSandboxReady && isConnected ? (
											<LuLoader className="size-4 animate-spin" />
										) : (
											<LuArrowUp className="size-4" />
										)}
									</Button>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Archive Confirmation Dialog */}
			<AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Archive this session?</AlertDialogTitle>
						<AlertDialogDescription>
							This will archive the session and stop the cloud sandbox. You can
							view and restore archived sessions from the home page.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleArchive}
							disabled={archiveMutation.isPending}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{archiveMutation.isPending ? (
								<>
									<LuLoader className="size-4 mr-2 animate-spin" />
									Archiving...
								</>
							) : (
								"Archive"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function SessionListItem({
	workspace,
	isActive,
	realtimeSandboxStatus,
}: {
	workspace: CloudWorkspace;
	isActive?: boolean;
	realtimeSandboxStatus?: string;
}) {
	// Use real-time status if available (for current session), otherwise use database status
	const sandboxStatus = realtimeSandboxStatus ?? workspace.sandboxStatus;

	// Determine status indicator color and label
	const getStatusInfo = () => {
		if (sandboxStatus === "ready" || sandboxStatus === "running") {
			return { color: "bg-green-500", label: "Running" };
		}
		if (sandboxStatus === "warming" || sandboxStatus === "syncing") {
			return {
				color: "bg-amber-500 animate-pulse",
				label: sandboxStatus === "warming" ? "Warming" : "Syncing",
			};
		}
		if (sandboxStatus === "error" || sandboxStatus === "failed") {
			return { color: "bg-red-500", label: "Error" };
		}
		// No sandbox or stopped
		return { color: "bg-muted-foreground/30", label: "Inactive" };
	};

	const statusInfo = getStatusInfo();

	return (
		<Link
			href={`/cloud/${workspace.sessionId}`}
			className={cn(
				"block px-2 py-2 rounded-md transition-colors",
				isActive ? "bg-accent" : "hover:bg-muted",
			)}
		>
			<div className="flex items-center gap-2">
				<div
					className={cn("size-2 rounded-full shrink-0", statusInfo.color)}
					title={statusInfo.label}
				/>
				<p className="text-sm truncate flex-1">
					{workspace.title || `${workspace.repoOwner}/${workspace.repoName}`}
				</p>
			</div>
			<p className="text-xs text-muted-foreground mt-0.5 truncate pl-4">
				{formatRelativeTime(workspace.updatedAt)} · {workspace.repoOwner}/
				{workspace.repoName}
			</p>
		</Link>
	);
}

interface EventItemProps {
	event: CloudEvent;
}

function EventItem({ event }: EventItemProps) {
	const getEventContent = () => {
		switch (event.type) {
			case "token": {
				const data = event.data as { token?: string };
				return (
					<span className="font-mono text-sm whitespace-pre-wrap">
						{data.token}
					</span>
				);
			}

			case "tool_result": {
				const data = event.data as { result?: unknown; error?: string };
				return (
					<div className="space-y-2">
						{data.error ? (
							<pre className="text-xs bg-destructive/10 text-destructive p-3 rounded-lg overflow-x-auto font-mono">
								{data.error}
							</pre>
						) : (
							<pre className="text-xs bg-muted/30 border border-border/50 p-3 rounded-lg overflow-x-auto max-h-40 overflow-y-auto font-mono text-foreground/80">
								{typeof data.result === "string"
									? data.result
									: JSON.stringify(data.result, null, 2)}
							</pre>
						)}
					</div>
				);
			}

			case "error": {
				const data = event.data as { message?: string };
				return (
					<div className="flex items-start gap-2 text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3">
						<LuX className="size-4 shrink-0 mt-0.5" />
						<p className="text-sm">{data.message || "Unknown error"}</p>
					</div>
				);
			}

			case "git_sync": {
				const data = event.data as {
					status?: string;
					action?: string;
					branch?: string;
					repo?: string;
				};
				const action = data.status || data.action || "syncing";
				const detail = data.branch || data.repo || "";
				return (
					<div className="flex items-center gap-2 text-muted-foreground text-xs py-1">
						<LuGitBranch className="size-3" />
						<span>
							{action}
							{detail ? `: ${detail}` : ""}
						</span>
					</div>
				);
			}

			case "execution_complete": {
				return (
					<div className="flex items-center gap-2 text-green-600 dark:text-green-500 text-xs py-1">
						<LuCheck className="size-3" />
						<span className="font-medium">Complete</span>
					</div>
				);
			}

			case "heartbeat":
			case "tool_call":
				// tool_call is handled by ToolCallGroup
				return null;

			default:
				return (
					<pre className="text-xs text-muted-foreground/60 font-mono">
						{JSON.stringify(event.data, null, 2)}
					</pre>
				);
		}
	};

	// Don't render heartbeat or tool_call events (tool_call handled separately)
	if (event.type === "heartbeat" || event.type === "tool_call") {
		return null;
	}

	return <div>{getEventContent()}</div>;
}

function UserMessage({ content }: { content: string }) {
	return (
		<div className="flex justify-start">
			<div className="max-w-[85%] rounded-xl bg-muted/50 border border-border/50 px-4 py-2.5 shadow-sm">
				<p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
					{content}
				</p>
			</div>
		</div>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	};

	return (
		<button
			onClick={handleCopy}
			className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background border border-border/50 text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover/code:opacity-100"
			title={copied ? "Copied!" : "Copy code"}
		>
			{copied ? (
				<LuCheck className="size-3.5" />
			) : (
				<svg
					className="size-3.5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<rect
						x="9"
						y="9"
						width="13"
						height="13"
						rx="2"
						ry="2"
						strokeWidth="2"
					/>
					<path
						d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
						strokeWidth="2"
					/>
				</svg>
			)}
		</button>
	);
}

function AssistantMessage({ text }: { text: string }) {
	return (
		<div className="group/message">
			<div
				className="prose prose-sm dark:prose-invert max-w-none
				prose-p:text-foreground/80 prose-p:my-1 prose-p:leading-relaxed prose-p:text-sm
				prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
				prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
				prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-li:text-foreground/80 prose-li:text-sm
				prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-2
				prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none
				prose-blockquote:border-l-2 prose-blockquote:border-foreground/20 prose-blockquote:pl-4 prose-blockquote:text-foreground/70 prose-blockquote:not-italic
				prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
				prose-strong:text-foreground prose-strong:font-medium
			"
			>
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					components={{
						pre: ({ children, ...props }) => {
							// Extract code content for copy button using a ref
							const extractText = (node: React.ReactNode): string => {
								if (typeof node === "string") return node;
								if (typeof node === "number") return String(node);
								if (Array.isArray(node)) return node.map(extractText).join("");
								if (node && typeof node === "object" && "props" in node) {
									const element = node as React.ReactElement<{
										children?: React.ReactNode;
									}>;
									return extractText(element.props.children);
								}
								return "";
							};
							const codeContent = extractText(children).replace(/\n$/, "");

							return (
								<div className="relative group/code rounded-xl bg-muted/50 border border-border overflow-hidden my-2">
									<CopyButton text={codeContent} />
									<pre
										className="overflow-x-auto p-4 text-sm font-mono"
										{...props}
									>
										{children}
									</pre>
								</div>
							);
						},
						code: ({ className, children, ...props }) => {
							const isInline = !className;
							if (isInline) {
								return (
									<code
										className="rounded bg-foreground/[0.06] dark:bg-foreground/[0.1] px-1.5 py-0.5 text-[85%] font-mono"
										{...props}
									>
										{children}
									</code>
								);
							}
							return (
								<code className="font-mono text-sm" {...props}>
									{children}
								</code>
							);
						},
					}}
				>
					{text}
				</ReactMarkdown>
			</div>
		</div>
	);
}

function ArtifactButton({ artifact }: { artifact: Artifact }) {
	if (!artifact.url) return null;

	const getIcon = () => {
		switch (artifact.type) {
			case "pr":
				return <LuGitPullRequest className="size-3" />;
			case "preview":
				return <LuGlobe className="size-3" />;
			default:
				return <LuExternalLink className="size-3" />;
		}
	};

	const getLabel = () => {
		switch (artifact.type) {
			case "pr":
				return artifact.title || "PR";
			case "preview":
				return "Preview";
			default:
				return artifact.title || "Link";
		}
	};

	return (
		<Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
			<a href={artifact.url} target="_blank" rel="noopener noreferrer">
				{getIcon()}
				{getLabel()}
			</a>
		</Button>
	);
}

function ParticipantAvatars({
	participants,
}: {
	participants: ParticipantPresence[];
}) {
	const onlineParticipants = participants.filter((p) => p.isOnline);
	const offlineParticipants = participants.filter((p) => !p.isOnline);

	// Show up to 3 online avatars, then +N
	const visibleOnline = onlineParticipants.slice(0, 3);
	const remainingCount =
		onlineParticipants.length - 3 + offlineParticipants.length;

	if (participants.length === 0) return null;

	return (
		<div className="flex items-center -space-x-2">
			{visibleOnline.map((p) => (
				<div key={p.id} className="relative" title={`${p.userName} (online)`}>
					{p.avatarUrl ? (
						<img
							src={p.avatarUrl}
							alt={p.userName}
							className="size-7 rounded-full border-2 border-background"
						/>
					) : (
						<div className="size-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium">
							{p.userName.charAt(0).toUpperCase()}
						</div>
					)}
					<span className="absolute bottom-0 right-0 size-2 rounded-full bg-green-500 border border-background" />
				</div>
			))}
			{remainingCount > 0 && (
				<div
					className="size-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium"
					title={`${remainingCount} more participant${remainingCount > 1 ? "s" : ""}`}
				>
					+{remainingCount}
				</div>
			)}
		</div>
	);
}

function FilesChangedDropdown({ files }: { files: FileChange[] }) {
	const getFileIcon = (type: FileChange["type"]) => {
		switch (type) {
			case "added":
				return <span className="text-green-500">+</span>;
			case "modified":
				return <span className="text-amber-500">~</span>;
			case "deleted":
				return <span className="text-red-500">-</span>;
			default:
				return <LuFile className="size-3" />;
		}
	};

	const getFileName = (path: string) => {
		const parts = path.split("/");
		return parts[parts.length - 1];
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
					<LuFile className="size-3" />
					{files.length} file{files.length !== 1 ? "s" : ""} changed
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="max-h-64 overflow-auto w-64">
				{files.slice(0, 20).map((file) => (
					<DropdownMenuItem
						key={file.path}
						className="flex items-center gap-2 font-mono text-xs"
						title={file.path}
					>
						{getFileIcon(file.type)}
						<span className="truncate">{getFileName(file.path)}</span>
					</DropdownMenuItem>
				))}
				{files.length > 20 && (
					<div className="px-2 py-1 text-xs text-muted-foreground">
						+{files.length - 20} more files
					</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
