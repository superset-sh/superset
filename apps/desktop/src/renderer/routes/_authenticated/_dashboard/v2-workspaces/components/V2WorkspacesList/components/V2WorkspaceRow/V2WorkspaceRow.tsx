import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { CgLaptop } from "react-icons/cg";
import { LuGitBranch, LuSquareTerminal, LuTrash2 } from "react-icons/lu";
import { RiPushpinFill, RiPushpinLine } from "react-icons/ri";
import { V2WorkspaceContextMenu } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceContextMenu";
import { V2WorkspaceProjectIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceProjectIcon";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { workspaceActivityAt } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/sortWorkspaces";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { WorkspaceAgentIcon } from "./components/WorkspaceAgentIcon";
import { WorkspacePrPill } from "./components/WorkspacePrPill";
import { WorkspaceStateGlyph } from "./components/WorkspaceStateGlyph";

interface V2WorkspaceRowProps {
	workspace: AccessibleV2Workspace;
	isCurrentRoute: boolean;
}

/** 181909 → "181.9k" — keeps outlier churn from blowing out the stats slot. */
function formatCount(count: number): string {
	if (count < 10_000) return String(count);
	return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export function V2WorkspaceRow({
	workspace,
	isCurrentRoute,
}: V2WorkspaceRowProps) {
	const isMainWorkspace = workspace.type === "main";

	const creatorLabel = workspace.isCreatedByCurrentUser
		? "you"
		: workspace.createdByName;

	// The visible age tracks activity (matches the default sort); creation
	// and last-agent-event details live in the tooltip.
	const timeLabel = getRelativeTime(workspaceActivityAt(workspace), {
		format: "compact",
	});
	const timeTitle = [
		`Created ${workspace.createdAt.toLocaleString()}${creatorLabel ? ` by ${creatorLabel}` : ""}`,
		workspace.lastAgentEventAt
			? `Last agent activity ${new Date(workspace.lastAgentEventAt).toLocaleString()}`
			: null,
	]
		.filter(Boolean)
		.join("\n");

	return (
		<V2WorkspaceContextMenu
			workspace={workspace}
			isCurrentRoute={isCurrentRoute}
		>
			{(actions) => (
				// biome-ignore lint/a11y/useSemanticElements: The row contains nested action buttons, so it cannot be a native button.
				<div
					role="button"
					aria-current={isCurrentRoute ? "page" : undefined}
					tabIndex={0}
					onClick={actions.open}
					onKeyDown={(event) => {
						if (event.target !== event.currentTarget) return;
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							actions.open();
						}
					}}
					className={cn(
						"group/row flex h-9 cursor-pointer items-center gap-2 border-b border-border/40 px-6 text-sm outline-none transition-colors",
						"focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
						isCurrentRoute
							? "bg-muted hover:bg-muted focus-visible:bg-muted"
							: "hover:bg-accent/50 focus-visible:bg-accent/50",
					)}
				>
					<WorkspaceStateGlyph workspace={workspace} />

					{isMainWorkspace ? (
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<CgLaptop
									className="size-3.5 shrink-0 text-muted-foreground"
									aria-label="Main workspace"
								/>
							</TooltipTrigger>
							<TooltipContent side="top">Main workspace</TooltipContent>
						</Tooltip>
					) : null}

					<span
						className={cn(
							"min-w-0 truncate font-medium",
							// Done states recede so live work owns the contrast.
							workspace.archivedAt != null || workspace.pr?.state === "merged"
								? "text-muted-foreground"
								: "text-foreground",
						)}
						title={workspace.name}
					>
						{workspace.name}
					</span>

					{/* Automation runs share a name; the run stamp is the "AS-11"
					    that tells ten identical rows apart (Linear's muted ID). */}
					{workspace.type === "session" ? (
						<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
							{workspace.createdAt.toLocaleDateString(undefined, {
								month: "short",
								day: "numeric",
							})}
							{" · "}
							{workspace.createdAt.toLocaleTimeString(undefined, {
								hour: "2-digit",
								minute: "2-digit",
							})}
						</span>
					) : null}

					{workspace.pr ? (
						<WorkspacePrPill pr={workspace.pr} branch={workspace.branch} />
					) : null}

					<div className="ml-auto flex shrink-0 items-center gap-3">
						{/* Space is always reserved so metadata never shifts when the
						    actions fade in on hover. */}
						<span className="flex w-14 items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
							{workspace.isInSidebar ? (
								<Button
									size="icon"
									variant="ghost"
									onClick={(event) => {
										event.stopPropagation();
										actions.removeFromSidebar();
									}}
									disabled={isCurrentRoute}
									aria-label="Unpin from sidebar"
									title={
										isCurrentRoute
											? "Can't unpin the current workspace"
											: "Unpin from sidebar"
									}
									className="size-6 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
								>
									<RiPushpinFill className="size-3.5" />
								</Button>
							) : (
								<Button
									size="icon"
									variant="ghost"
									onClick={(event) => {
										event.stopPropagation();
										actions.addToSidebar();
									}}
									aria-label="Pin to sidebar"
									title="Pin to sidebar"
									className="size-6 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
								>
									<RiPushpinLine className="size-3.5" />
								</Button>
							)}
							{!isMainWorkspace ? (
								<Button
									size="icon"
									variant="ghost"
									onClick={(event) => {
										event.stopPropagation();
										actions.openDeleteDialog();
									}}
									aria-label="Delete workspace"
									title="Delete workspace"
									className="size-6 text-muted-foreground hover:bg-transparent hover:text-destructive dark:hover:bg-transparent"
								>
									<LuTrash2 className="size-3.5" />
								</Button>
							) : null}
						</span>

						{workspace.agentIds.length > 0 ? (
							<span className="flex items-center gap-1">
								{workspace.agentIds.slice(0, 3).map((agentId) => (
									<WorkspaceAgentIcon key={agentId} agentId={agentId} />
								))}
							</span>
						) : null}

						{/* Fixed-width slots keep the metadata columns vertically
						    aligned across rows without table markup. */}
						<span
							className="flex w-24 items-center justify-end gap-1.5 font-mono text-[11px] tabular-nums leading-none"
							title={
								workspace.diffStats
									? `${workspace.diffStats.fileCount} changed ${workspace.diffStats.fileCount === 1 ? "file" : "files"}`
									: undefined
							}
						>
							{workspace.diffStats &&
							(workspace.diffStats.additions > 0 ||
								workspace.diffStats.deletions > 0) ? (
								<>
									<span className="text-emerald-600/80 dark:text-emerald-400/70">
										+{formatCount(workspace.diffStats.additions)}
									</span>
									<span className="text-red-600/80 dark:text-red-400/70">
										−{formatCount(workspace.diffStats.deletions)}
									</span>
								</>
							) : null}
						</span>

						{/* Branch equal to the display name (main workspaces) or a
						    session's default checkout says nothing — leave the slot
						    empty but keep alignment. */}
						<span
							className="hidden w-48 items-center gap-1.5 text-xs text-muted-foreground md:flex"
							title={workspace.branch}
						>
							{workspace.type !== "session" &&
							workspace.branch.toLowerCase() !==
								workspace.name.toLowerCase() ? (
								<>
									<LuGitBranch className="size-3 shrink-0" />
									<span className="min-w-0 truncate font-mono text-[11px]">
										{workspace.branch}
									</span>
								</>
							) : null}
						</span>

						{/* Icon-only below lg so the project is identifiable at every
						    width; the name joins it when there's room. */}
						<span
							className="flex w-4 items-center gap-1.5 lg:w-36"
							title={workspace.projectName ?? "Session (no project)"}
						>
							{workspace.projectName ? (
								<>
									<V2WorkspaceProjectIcon
										projectName={workspace.projectName}
										iconUrl={workspace.projectIconUrl}
										size="sm"
										className="size-4 text-[8px]"
									/>
									<span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
										{workspace.projectName}
									</span>
								</>
							) : (
								<>
									<LuSquareTerminal className="size-3.5 shrink-0 text-muted-foreground/70" />
									<span className="hidden min-w-0 truncate text-xs text-muted-foreground/70 lg:block">
										Session
									</span>
								</>
							)}
						</span>

						<span
							className="w-14 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground"
							title={timeTitle}
						>
							{timeLabel}
						</span>
					</div>
				</div>
			)}
		</V2WorkspaceContextMenu>
	);
}
