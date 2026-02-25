import { alert } from "@superset/ui/atoms/Alert";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useMemo, useState } from "react";
import {
	HiMiniArrowDownTray,
	HiMiniChatBubbleLeftRight,
	HiMiniChevronDown,
	HiMiniPlus,
	HiMiniTrash,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface SessionItem {
	sessionId: string;
	title: string;
	updatedAt: Date;
}

interface SessionSelectorProps {
	currentSessionId: string | null;
	sessions: SessionItem[];
	workspaceId: string;
	organizationId: string | null;
	cwd: string;
	onSelectSession: (sessionId: string) => void;
	onImportClaudeSession: (sessionId: string) => void;
	onNewChat: () => Promise<void>;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

function formatSessionDate(isoDate: string): string {
	const parsed = new Date(isoDate);
	if (Number.isNaN(parsed.getTime())) return isoDate;
	return parsed.toLocaleString();
}

export function SessionSelector({
	currentSessionId,
	sessions,
	workspaceId,
	organizationId,
	cwd,
	onSelectSession,
	onImportClaudeSession,
	onNewChat,
	onDeleteSession,
}: SessionSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);

	const sortedSessions = useMemo(() => {
		return [...sessions].sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
		);
	}, [sessions]);

	const current = sortedSessions.find(
		(session) => session.sessionId === currentSessionId,
	);
	const currentTitle = current?.title || "New Chat";
	const {
		data: claudeSessions,
		isLoading: isLoadingClaudeSessions,
		error: claudeSessionsError,
	} = electronTrpc.chatServiceClaude.listSessions.useQuery(
		{
			cwd: cwd.trim().length > 0 ? cwd : "/",
			limit: 20,
		},
		{
			enabled: isOpen,
			staleTime: 30_000,
		},
	);
	const importClaudeSessionMutation =
		electronTrpc.chatServiceClaude.importSession.useMutation();
	const claudeSessionsErrorMessage =
		claudeSessionsError instanceof Error
			? claudeSessionsError.message
			: "Failed to load Claude sessions";
	const requiresMainRestart =
		claudeSessionsErrorMessage.includes("No \"query\"-procedure") ||
		claudeSessionsErrorMessage.includes("No procedure");

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<HiMiniChatBubbleLeftRight className="size-3.5" />
					<span className="max-w-[120px] truncate">{currentTitle}</span>
					<HiMiniChevronDown className="size-3" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuLabel className="text-xs">Sessions</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<div className="max-h-80 overflow-y-auto">
					{sortedSessions.length > 0 ? (
						sortedSessions.map((session) => (
							<DropdownMenuItem
								key={session.sessionId}
								className="group flex items-center justify-between gap-2"
								onSelect={() => {
									onSelectSession(session.sessionId);
									setIsOpen(false);
								}}
							>
								<span
									className={`min-w-0 truncate text-xs ${session.sessionId === currentSessionId ? "font-semibold" : ""}`}
								>
									{session.title || "New Chat"}
								</span>
								{session.sessionId !== currentSessionId && (
									<button
										type="button"
										className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
										onClick={(event) => {
											event.stopPropagation();
											alert.destructive({
												title: "Delete Chat Session",
												description:
													"Are you sure you want to delete this session?",
												confirmText: "Delete",
												onConfirm: () => {
													toast.promise(onDeleteSession(session.sessionId), {
														loading: "Deleting session...",
														success: "Session deleted",
														error: "Failed to delete session",
													});
												},
											});
										}}
									>
										<HiMiniTrash className="size-3" />
									</button>
								)}
							</DropdownMenuItem>
						))
					) : (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							No sessions yet
						</div>
					)}
				</div>

				<DropdownMenuSeparator />
				<DropdownMenuLabel className="text-xs">
					Claude Sessions
				</DropdownMenuLabel>
				<div className="max-h-48 overflow-y-auto">
					{isLoadingClaudeSessions ? (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							Loading Claude sessions...
						</div>
					) : claudeSessionsError ? (
						<div className="px-2 py-1.5 text-xs text-destructive">
							<div className="truncate">{claudeSessionsErrorMessage}</div>
							{requiresMainRestart ? (
								<div className="text-[10px] text-muted-foreground">
									Restart desktop app to refresh main-process routes
								</div>
							) : null}
						</div>
					) : claudeSessions && claudeSessions.length > 0 ? (
						claudeSessions.map((claudeSession) => (
							<DropdownMenuItem
								key={claudeSession.filePath}
								disabled={importClaudeSessionMutation.isPending}
								className="group flex items-center justify-between gap-2"
								onSelect={(event) => {
									event.preventDefault();
									if (!organizationId) {
										toast.error("Organization is required to import session");
										return;
									}
									void (async () => {
										try {
											const imported =
												await importClaudeSessionMutation.mutateAsync({
													filePath: claudeSession.filePath,
													organizationId,
													workspaceId,
												});
											onImportClaudeSession(imported.sessionId);
											setIsOpen(false);
											toast.success("Claude session imported");
										} catch (error) {
											toast.error(
												error instanceof Error
													? error.message
													: "Failed to import Claude session",
											);
										}
									})();
								}}
							>
								<div className="min-w-0">
									<div className="truncate text-xs">{claudeSession.title}</div>
									<div className="truncate text-[10px] text-muted-foreground">
										{formatSessionDate(claudeSession.lastModifiedAt)}
									</div>
								</div>
								<HiMiniArrowDownTray className="size-3 shrink-0 text-muted-foreground group-hover:text-foreground" />
							</DropdownMenuItem>
						))
					) : (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							No Claude sessions found
						</div>
					)}
				</div>

				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => {
						void onNewChat();
						setIsOpen(false);
					}}
				>
					<HiMiniPlus className="mr-1.5 size-3.5" />
					<span className="text-xs">New Chat</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
