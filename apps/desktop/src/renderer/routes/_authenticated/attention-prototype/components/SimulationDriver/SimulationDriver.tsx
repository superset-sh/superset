import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import { FIXTURE_NOW } from "../../fixtures/workspaces";
import { formatAge } from "../../model/formatAge";
import { usePrototypeStore } from "../../store/usePrototypeStore";

/**
 * Dev control strip: mutate the fixture fleet so the view system and ⌘J HUD can
 * be felt live — block/finish agents, bump activity, and advance a virtual clock.
 */
export function SimulationDriver() {
	const workspaces = usePrototypeStore((s) => s.workspaces);
	const now = usePrototypeStore((s) => s.now);
	const activeWorkspaceId = usePrototypeStore((s) => s.activeWorkspaceId);
	const revealWorkspace = usePrototypeStore((s) => s.revealWorkspace);

	// Alphabetical, independent of the sidebar's view config: the table is a
	// lookup surface, so a stable scannable order beats mirroring the sidebar.
	const sortedWorkspaces = useMemo(
		() =>
			[...workspaces].sort((a, b) =>
				a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
			),
		[workspaces],
	);
	const blockOnInput = usePrototypeStore((s) => s.blockOnInput);
	const finishTurn = usePrototypeStore((s) => s.finishTurn);
	const setAgentStatus = usePrototypeStore((s) => s.setAgentStatus);
	const bumpActivity = usePrototypeStore((s) => s.bumpActivity);
	const advanceClock = usePrototypeStore((s) => s.advanceClock);
	const reset = usePrototypeStore((s) => s.reset);
	const toggleHud = usePrototypeStore((s) => s.toggleHud);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background p-5">
			{/* The page title lives in PrototypeTopBar, alongside the window chrome. */}
			<p className="mb-4 max-w-prose text-muted-foreground text-sm">
				A dev-only playground for the proposed view system (group-by / order-by,
				adaptive cards) and the ⌘J jump HUD. Everything is fixtures + simulation
				— no live workspaces are touched. Use the controls below to change agent
				state and watch the sidebar re-group and re-order.
			</p>

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<ClockButton onClick={() => advanceClock(5)}>+5m</ClockButton>
				<ClockButton onClick={() => advanceClock(60)}>+1h</ClockButton>
				<ClockButton onClick={() => advanceClock(60 * 24)}>+1d</ClockButton>
				<button
					type="button"
					onClick={toggleHud}
					className="rounded-md border border-border bg-muted/40 px-2.5 py-1 font-medium text-xs transition-colors hover:bg-accent"
				>
					Open ⌘J HUD
				</button>
				<button
					type="button"
					onClick={reset}
					className="rounded-md border border-border px-2.5 py-1 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
				>
					Reset
				</button>
				<span className="ml-auto text-muted-foreground text-xs">
					clock: fixture now + {Math.round((now - FIXTURE_NOW) / 60_000)}m
				</span>
			</div>

			<div className="overflow-hidden rounded-lg border border-border">
				<table className="w-full text-sm">
					<thead>
						{/* Fixed widths on the variable-content columns so a status
						    change ("permission" → "failed") doesn't reflow the row and
						    move the Simulate buttons out from under the pointer. */}
						<tr className="border-border border-b bg-muted/30 text-left text-muted-foreground text-xs">
							<th className="px-3 py-2 font-medium">Workspace</th>
							<th className="w-28 px-3 py-2 font-medium">Status</th>
							<th className="w-24 px-3 py-2 font-medium">Last activity</th>
							<th className="px-3 py-2 font-medium">Simulate</th>
						</tr>
					</thead>
					<tbody>
						{sortedWorkspaces.map((workspace) => (
							// Selection is synced both ways with the sidebar: clicking a
							// board row reveals the workspace there (like a ⌘J jump), and
							// a sidebar selection highlights the row here.
							<tr
								key={workspace.id}
								onClick={() => revealWorkspace(workspace.id)}
								className={cn(
									"cursor-pointer border-border/60 border-b transition-colors last:border-b-0",
									workspace.id === activeWorkspaceId
										? "bg-accent"
										: "hover:bg-muted/40",
								)}
							>
								<td className="px-3 py-2">
									<div className="font-medium text-foreground">
										{workspace.title}
									</div>
									<div className="text-muted-foreground text-xs">
										{workspace.repo.name}
									</div>
								</td>
								<td className="px-3 py-2">
									<StatusPill status={workspace.agentStatus} />
								</td>
								<td className="px-3 py-2 font-mono text-muted-foreground text-xs tabular-nums">
									{formatAge(now, workspace.lastActivityAt)}
								</td>
								<td className="px-3 py-2">
									<div className="flex flex-wrap gap-1">
										{/* Ordered to mirror the sidebar's agent-status group
										    order: Needs input, Failed, Working, Ready for review. */}
										<SimButton onClick={() => blockOnInput(workspace.id)}>
											Block
										</SimButton>
										<SimButton
											onClick={() => setAgentStatus(workspace.id, "failed")}
										>
											Fail
										</SimButton>
										<SimButton
											onClick={() => setAgentStatus(workspace.id, "working")}
										>
											Work
										</SimButton>
										<SimButton onClick={() => finishTurn(workspace.id)}>
											Finish
										</SimButton>
										<SimButton onClick={() => bumpActivity(workspace.id)}>
											Bump
										</SimButton>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function ClockButton({
	onClick,
	children,
}: {
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="rounded-md border border-border bg-muted/40 px-2.5 py-1 font-medium font-mono text-xs transition-colors hover:bg-accent"
		>
			{children}
		</button>
	);
}

function SimButton({
	onClick,
	children,
}: {
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			// Sim actions shouldn't also change the selection — the row's own
			// click handles select-and-reveal.
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
			className="rounded border border-border px-2 py-0.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
		>
			{children}
		</button>
	);
}

const STATUS_PILL: Record<string, string> = {
	permission: "bg-red-500/15 text-red-500",
	failed: "bg-red-500/15 text-red-500",
	working: "bg-amber-500/15 text-amber-500",
	review: "bg-green-500/15 text-green-500",
	idle: "bg-muted text-muted-foreground",
};

function StatusPill({ status }: { status: string }) {
	return (
		<span
			className={cn(
				"inline-flex rounded-full px-2 py-0.5 font-medium text-xs",
				STATUS_PILL[status] ?? STATUS_PILL.idle,
			)}
		>
			{status}
		</span>
	);
}
