"use client";

import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superset/ui/card";
import { Input } from "@superset/ui/input";
import { ScrollArea } from "@superset/ui/scroll-area";
import { cn } from "@superset/ui/utils";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	LuCircle,
	LuGitBranch,
	LuGithub,
	LuLoader,
	LuPanelLeftClose,
	LuPanelLeftOpen,
	LuPlus,
	LuSend,
	LuSquare,
	LuTerminal,
	LuWifi,
	LuWifiOff,
} from "react-icons/lu";

import { env } from "@/env";
import { type CloudEvent, useCloudSession } from "../../hooks";
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
			const data = event.data as { token?: string };
			if (data.token) {
				if (!currentTokenGroup) {
					currentTokenGroup = { id: event.id, tokens: [] };
				}
				currentTokenGroup.tokens.push(data.token);
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
	workspaces,
}: CloudWorkspaceContentProps) {
	const [promptInput, setPromptInput] = useState("");
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const {
		isConnected,
		isConnecting,
		isLoadingHistory,
		isSpawning,
		error,
		sessionState,
		events,
		sendPrompt,
		sendStop,
	} = useCloudSession({
		controlPlaneUrl: CONTROL_PLANE_URL,
		sessionId: workspace.sessionId,
	});

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
		if (promptInput.trim() && isConnected) {
			sendPrompt(promptInput.trim());
			setPromptInput("");
			inputRef.current?.focus();
		}
	}, [promptInput, isConnected, sendPrompt]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSendPrompt();
			}
		},
		[handleSendPrompt],
	);

	const isExecuting =
		sessionState?.status === "executing" ||
		workspace.sandboxStatus === "running";

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
					<div className="flex items-center gap-2">
						<Button variant="ghost" size="icon" className="size-8" asChild>
							<Link href="/cloud/new">
								<LuPlus className="size-4" />
							</Link>
						</Button>
						<div className="size-8 rounded-full bg-muted" />
					</div>
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
						<h1 className="text-sm font-semibold truncate">
							{workspace.title}
						</h1>
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
							{isConnecting ? (
								<LuLoader className="size-3 animate-spin" />
							) : isConnected ? (
								<LuWifi className="size-3" />
							) : (
								<LuWifiOff className="size-3" />
							)}
							{isConnecting
								? "Connecting..."
								: isConnected
									? "Connected"
									: "Disconnected"}
						</Badge>
						<Badge variant="outline">{workspace.status}</Badge>
						{(sessionState?.sandboxStatus || workspace.sandboxStatus || isSpawning) && (
							<Badge
								variant={
									(sessionState?.sandboxStatus || workspace.sandboxStatus) === "ready"
										? "default"
										: "secondary"
								}
								className="gap-1"
							>
								{isSpawning && <LuLoader className="size-3 animate-spin" />}
								{isSpawning
									? "Spawning..."
									: sessionState?.sandboxStatus || workspace.sandboxStatus}
							</Badge>
						)}
					</div>
				</header>

				{/* Main content area */}
				<main className="flex min-h-0 flex-1 flex-col">
					{/* Events display */}
					<ScrollArea ref={scrollAreaRef} className="flex-1 p-4 h-full">
						<div className="space-y-2">
							{events.length === 0 && !error && (
								<Card>
									<CardHeader>
										<CardTitle className="flex items-center gap-2 text-base">
											<LuTerminal className="size-4" />
											Cloud Terminal
										</CardTitle>
									</CardHeader>
									<CardContent>
										<p className="text-sm text-muted-foreground">
											{isSpawning
												? "Starting cloud sandbox..."
												: isConnected
													? sessionState?.sandboxStatus === "ready"
														? "Connected to cloud workspace. Send a prompt to start."
														: "Connected. Waiting for sandbox to be ready..."
													: isConnecting
														? "Connecting to cloud workspace..."
														: "Waiting for connection..."}
										</p>
									</CardContent>
								</Card>
							)}

							{error && (
								<Card className="border-destructive">
									<CardContent className="pt-4">
										<p className="text-sm text-destructive">{error}</p>
									</CardContent>
								</Card>
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
										<UserMessage key={`user-${index}-${grouped.id}`} content={grouped.content} />
									);
								}
								if (grouped.type === "assistant_message") {
									return (
										<AssistantMessage key={`assistant-${index}-${grouped.id}`} text={grouped.text} />
									);
								}
								if (grouped.type === "tool_call_group") {
									return (
										<div
											key={`tools-${index}-${grouped.id}`}
											className="rounded-lg border bg-card p-3 text-card-foreground"
										>
											<ToolCallGroup
												events={grouped.events}
												groupId={grouped.id}
											/>
										</div>
									);
								}
								return (
									<EventItem key={`event-${index}-${grouped.event.id}`} event={grouped.event} />
								);
							})}
						</div>
					</ScrollArea>

					{/* Prompt input */}
					<div className="border-t p-4">
						<div className="flex gap-2">
							<Input
								ref={inputRef}
								value={promptInput}
								onChange={(e) => setPromptInput(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder={
									isConnected
										? "Send a prompt to Claude..."
										: "Connecting to cloud workspace..."
								}
								disabled={!isConnected}
								className="flex-1"
							/>
							{isExecuting ? (
								<Button
									variant="destructive"
									onClick={sendStop}
									disabled={!isConnected}
								>
									<LuSquare className="mr-2 size-4" />
									Stop
								</Button>
							) : (
								<Button
									onClick={handleSendPrompt}
									disabled={!isConnected || !promptInput.trim()}
								>
									<LuSend className="mr-2 size-4" />
									Send
								</Button>
							)}
						</div>
					</div>
				</main>
			</div>
		</div>
	);
}

function SessionListItem({
	workspace,
	isActive,
}: {
	workspace: CloudWorkspace;
	isActive?: boolean;
}) {
	return (
		<Link
			href={`/cloud/${workspace.sessionId}`}
			className={cn(
				"block px-2 py-2 rounded-md transition-colors",
				isActive ? "bg-accent" : "hover:bg-muted",
			)}
		>
			<p className="text-sm truncate">
				{workspace.title || `${workspace.repoOwner}/${workspace.repoName}`}
			</p>
			<p className="text-xs text-muted-foreground mt-0.5 truncate">
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
					<div className="space-y-1">
						<Badge variant="secondary" className="text-xs">
							Tool Result
						</Badge>
						{data.error ? (
							<pre className="text-xs bg-destructive/10 text-destructive p-2 rounded overflow-x-auto">
								{data.error}
							</pre>
						) : (
							<pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40 overflow-y-auto">
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
					<div className="text-destructive">
						<Badge variant="destructive" className="text-xs mb-1">
							Error
						</Badge>
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
					<div className="flex items-center gap-2 text-muted-foreground">
						<LuGitBranch className="size-4" />
						<span className="text-sm">
							{action}
							{detail ? `: ${detail}` : ""}
						</span>
					</div>
				);
			}

			case "execution_complete": {
				return (
					<div className="flex items-center gap-2 text-green-600">
						<LuCircle className="size-3 fill-current" />
						<span className="text-sm font-medium">Execution complete</span>
					</div>
				);
			}

			case "heartbeat":
			case "tool_call":
				// tool_call is handled by ToolCallGroup
				return null;

			default:
				return (
					<pre className="text-xs text-muted-foreground">
						{JSON.stringify(event.data, null, 2)}
					</pre>
				);
		}
	};

	// Don't render heartbeat or tool_call events (tool_call handled separately)
	if (event.type === "heartbeat" || event.type === "tool_call") {
		return null;
	}

	return (
		<div className="rounded-lg border bg-card p-3 text-card-foreground">
			{getEventContent()}
		</div>
	);
}

function UserMessage({ content }: { content: string }) {
	return (
		<div className="rounded-lg border bg-accent/10 p-3 text-card-foreground">
			<div className="flex items-start gap-2">
				<span className="text-xs font-medium text-accent">You</span>
			</div>
			<p className="mt-1 text-sm whitespace-pre-wrap">{content}</p>
		</div>
	);
}

function AssistantMessage({ text }: { text: string }) {
	return (
		<div className="rounded-lg border bg-card p-3 text-card-foreground">
			<div className="prose prose-sm dark:prose-invert max-w-none">
				<pre className="font-mono text-sm whitespace-pre-wrap bg-transparent p-0 m-0 overflow-x-auto">
					{text}
				</pre>
			</div>
		</div>
	);
}
