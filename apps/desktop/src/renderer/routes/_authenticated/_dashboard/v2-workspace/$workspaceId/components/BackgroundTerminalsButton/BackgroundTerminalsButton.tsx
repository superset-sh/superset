import type { WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { Archive, ChevronDown, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";

interface BackgroundTerminalsButtonProps {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}

/**
 * Tab-bar control that surfaces running terminal daemon sessions for the
 * workspace that have no pane attached (e.g. moved to background via the
 * terminal pane header). Renders nothing when there are none; otherwise a
 * single button with a dropdown to re-open or kill each background session.
 */
export function BackgroundTerminalsButton({
	workspaceId,
	store,
}: BackgroundTerminalsButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const tabs = useStore(store, (s) => s.tabs);
	const utils = workspaceTrpc.useUtils();
	const killSession = workspaceTrpc.terminal.killSession.useMutation();
	const sessionsQuery = workspaceTrpc.terminal.listSessions.useQuery(
		{ workspaceId },
		{ refetchInterval: isOpen ? 2_000 : 5_000, refetchOnWindowFocus: true },
	);

	const attachedTerminalIds = useMemo(() => {
		const ids = new Set<string>();
		for (const tab of tabs) {
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind !== "terminal") continue;
				const data = pane.data as Partial<TerminalPaneData>;
				if (data.terminalId) ids.add(data.terminalId);
			}
		}
		return ids;
	}, [tabs]);

	const backgroundSessions = useMemo(() => {
		const sessions = sessionsQuery.data?.sessions ?? [];
		return sessions
			.filter((session) => !attachedTerminalIds.has(session.terminalId))
			.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
	}, [sessionsQuery.data?.sessions, attachedTerminalIds]);

	if (backgroundSessions.length === 0) return null;

	const label = `${backgroundSessions.length} background terminal session${
		backgroundSessions.length === 1 ? "" : "s"
	}`;

	const handleAdopt = (terminalId: string) => {
		store.getState().addTab({
			panes: [
				{
					kind: "terminal",
					data: { terminalId } as TerminalPaneData,
				},
			],
		});
		void utils.terminal.listSessions.invalidate({ workspaceId });
		setIsOpen(false);
	};

	const handleKill = async (terminalId: string) => {
		try {
			await killSession.mutateAsync({ terminalId, workspaceId });
		} catch (error) {
			console.error(
				"[BackgroundTerminalsButton] Failed to kill session:",
				error,
			);
			toast.error("Failed to close terminal session");
		} finally {
			void utils.terminal.listSessions.invalidate({ workspaceId });
		}
	};

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					className="h-7 gap-1 rounded-md border border-border/60 bg-muted/30 px-2 text-xs text-muted-foreground shadow-none hover:bg-accent/60 hover:text-foreground"
					size="sm"
					type="button"
					variant="ghost"
				>
					<Archive className="size-3.5" />
					<span>{label}</span>
					<ChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-80">
				<DropdownMenuLabel className="text-xs">
					Background terminal sessions
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<div className="max-h-80 overflow-y-auto">
					{backgroundSessions.map((session) => (
						<DropdownMenuItem
							key={session.terminalId}
							className="group flex items-center gap-2"
							onSelect={() => handleAdopt(session.terminalId)}
						>
							<Archive className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="min-w-0 flex-1 truncate text-xs">
								{session.title ?? "Terminal"}
							</span>
							{session.createdAt > 0 && (
								<span className="shrink-0 text-xs text-muted-foreground/70">
									{getRelativeTime(session.createdAt, { format: "compact" })}
								</span>
							)}
							<button
								type="button"
								aria-label="Close terminal session"
								title="Close terminal session"
								disabled={
									killSession.isPending &&
									killSession.variables?.terminalId === session.terminalId
								}
								className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 group-hover:opacity-100"
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									void handleKill(session.terminalId);
								}}
							>
								<Trash2 className="size-3" />
							</button>
						</DropdownMenuItem>
					))}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
