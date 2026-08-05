import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import { rankForHud } from "../../model/buildPrototypeView";
import { formatAge } from "../../model/formatAge";
import type { PrototypeWorkspace } from "../../model/types";
import { usePrototypeStore } from "../../store/usePrototypeStore";

const REASON: Record<ActivePaneStatus, string> = {
	permission: "Needs input",
	failed: "Agent failed",
	working: "Working",
	review: "Ready for review",
};

function reasonFor(workspace: PrototypeWorkspace): string {
	if (workspace.agentStatus !== "idle") return REASON[workspace.agentStatus];
	if (workspace.pullRequest?.checksStatus === "failure")
		return "Checks failing";
	if (workspace.pullRequest?.reviewDecision === "changes_requested")
		return "Changes requested";
	return "Recently active";
}

/**
 * ⌘J jump HUD (prototype). Mirrors the command-palette shell (Radix Dialog +
 * app tokens) but drives its own keyboard model: attention-ranked list, ↑↓ to
 * move, ↵ / 1–9 to jump, Esc to close. S/E are shown as visual verb stubs.
 */
export function AttentionHud() {
	const open = usePrototypeStore((s) => s.hudOpen);
	const setOpen = usePrototypeStore((s) => s.setHudOpen);
	const workspaces = usePrototypeStore((s) => s.workspaces);
	const now = usePrototypeStore((s) => s.now);
	const revealWorkspace = usePrototypeStore((s) => s.revealWorkspace);

	const ranked = useMemo(() => rankForHud(workspaces), [workspaces]);
	const [selected, setSelected] = useState(0);
	const listRef = useRef<HTMLDivElement>(null);

	// Reset selection whenever the HUD opens.
	useEffect(() => {
		if (open) setSelected(0);
	}, [open]);

	const jumpTo = (workspace: PrototypeWorkspace | undefined) => {
		if (!workspace) return;
		// Reveal (select + expand its group if collapsed) so the jump always
		// lands somewhere visible in the sidebar.
		revealWorkspace(workspace.id);
		setOpen(false);
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setSelected((i) => Math.min(i + 1, ranked.length - 1));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setSelected((i) => Math.max(i - 1, 0));
		} else if (event.key === "Enter") {
			event.preventDefault();
			jumpTo(ranked[selected]);
		} else if (/^[1-9]$/.test(event.key)) {
			const index = Number(event.key) - 1;
			if (index < ranked.length) {
				event.preventDefault();
				jumpTo(ranked[index]);
			}
		}
	};

	// Keep the selected row scrolled into view.
	useEffect(() => {
		const node = listRef.current?.querySelector<HTMLElement>(
			`[data-index="${selected}"]`,
		);
		node?.scrollIntoView({ block: "nearest" });
	}, [selected]);

	const attentionCount = ranked.filter((w) => w.agentStatus !== "idle").length;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				showCloseButton={false}
				onKeyDown={handleKeyDown}
				// Top edge at 10% of the viewport: the panel is tall, so a higher
				// anchor keeps its visual bulk out of the screen center.
				// translate-y-0 cancels the base dialog's own centering.
				// outline-none: with the rows unfocusable, Radix focuses this
				// panel itself — without it the keyboard-modality focus ring
				// wraps the whole dialog.
				className="!max-w-[560px] top-[10%] max-h-[80vh] translate-y-0 overflow-hidden p-0 outline-none"
			>
				<DialogHeader className="sr-only">
					<DialogTitle>Jump to workspace</DialogTitle>
					<DialogDescription>
						Attention-ranked list of workspaces. Use arrow keys and Enter to
						jump.
					</DialogDescription>
				</DialogHeader>

				<div className="flex items-center justify-between border-border/60 border-b px-3 py-2.5">
					<span className="font-medium text-[13px] text-foreground">
						Jump to workspace
					</span>
					<span className="text-muted-foreground text-xs">
						{attentionCount > 0
							? `${attentionCount} need you`
							: "nothing waiting"}
					</span>
				</div>

				<div
					ref={listRef}
					className="hide-scrollbar max-h-[min(440px,calc(75vh-6rem))] overflow-y-auto p-1.5"
				>
					{ranked.map((workspace, index) => {
						const activeStatus: ActivePaneStatus | null =
							workspace.agentStatus === "idle" ? null : workspace.agentStatus;
						const isSelected = index === selected;
						return (
							<button
								type="button"
								key={workspace.id}
								data-index={index}
								// The HUD has its own selection model (bg-accent row), so
								// rows opt out of focus: without this, Radix focuses row 1
								// on open and the first keypress paints a :focus-visible
								// ring there while the selection has already moved on.
								tabIndex={-1}
								onMouseMove={() => setSelected(index)}
								onClick={() => jumpTo(workspace)}
								className={cn(
									"flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors",
									isSelected ? "bg-accent" : "hover:bg-muted/50",
								)}
							>
								<span className="w-4 shrink-0 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
									{index < 9 ? index + 1 : ""}
								</span>
								<span className="flex size-2 shrink-0 items-center justify-center">
									{activeStatus ? (
										<StatusIndicator status={activeStatus} />
									) : (
										<span className="size-1.5 rounded-full bg-muted-foreground/40" />
									)}
								</span>
								<span className="flex min-w-0 flex-1 flex-col">
									<span
										className={cn(
											"truncate text-[13px] leading-tight",
											isSelected ? "text-foreground" : "text-foreground/80",
										)}
									>
										{workspace.title}
									</span>
									<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
										<ProjectThumbnail
											projectName={workspace.repo.name}
											iconUrl={workspace.repo.iconUrl}
											className="size-3 rounded-[3px] text-[7px]"
										/>
										<span className="truncate">{workspace.repo.name}</span>
										<span className="text-muted-foreground/40">·</span>
										<span className="truncate">{reasonFor(workspace)}</span>
									</span>
								</span>
								<span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
									{formatAge(now, workspace.lastActivityAt)}
								</span>
								{isSelected && (
									<span className="shrink-0 font-mono text-[10px] text-muted-foreground">
										↵ go
									</span>
								)}
							</button>
						);
					})}
				</div>

				<div className="flex items-center gap-3 border-border/60 border-t px-3 py-2 text-[11px] text-muted-foreground">
					<span>↑↓ move</span>
					<span>↵ jump</span>
					<span>1–9 pick</span>
					<span className="opacity-50">S snooze</span>
					<span className="opacity-50">E archive</span>
					<span className="ml-auto">esc close</span>
				</div>
			</DialogContent>
		</Dialog>
	);
}
