import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { CgLaptop } from "react-icons/cg";
import { WorkspaceNameMarquee } from "renderer/components/WorkspaceNameMarquee";
import { useFocusVisible } from "renderer/hooks/useFocusVisible";
import { V2WorkspaceContextMenu } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceContextMenu";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { workspaceActivityAt } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/sortWorkspaces";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
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
	const { t } = useLingui();
	const isMainWorkspace = workspace.type === "main";
	// Drives the name's hover-reveal for keyboard users: the row, not the
	// name span, is what's actually tabbable.
	const {
		isFocusVisible: isFocused,
		onFocus: handleRowFocus,
		onBlur: handleRowBlur,
	} = useFocusVisible();

	const creatorLabel = workspace.isCreatedByCurrentUser
		? t({ message: "you" })
		: workspace.createdByName;

	// The visible age tracks activity (matches the default sort); creation
	// and last-agent-event details live in the tooltip.
	const timeLabel = getRelativeTime(workspaceActivityAt(workspace), {
		format: "compact",
	});
	const createdAtLabel = workspace.createdAt.toLocaleString();
	const timeTitle = [
		creatorLabel
			? t({
					message: `Created ${createdAtLabel} by ${creatorLabel}`,
				})
			: t({
					message: `Created ${createdAtLabel}`,
				}),
		workspace.lastAgentEventAt
			? t({
					message: `Last agent activity ${new Date(workspace.lastAgentEventAt).toLocaleString()}`,
				})
			: null,
	]
		.filter(Boolean)
		.join("\n");

	// PR, branch, and project no longer get their own persistent slot in the
	// row — the list was trying to be a table and reads noisy for it. They're
	// still one hover away instead of gone outright.
	const rowTitle = [
		workspace.pr
			? t({
					message: `PR #${workspace.pr.prNumber} (${workspace.pr.state})`,
				})
			: null,
		workspace.type !== "session" &&
		workspace.branch.toLowerCase() !== workspace.name.toLowerCase()
			? t({
					message: `Branch: ${workspace.branch}`,
				})
			: null,
		t({
			message: `Project: ${
				workspace.projectName ??
				t({
					message: "none (session)",
				})
			}`,
		}),
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
					onFocus={handleRowFocus}
					onBlur={handleRowBlur}
					title={rowTitle}
					className={cn(
						"flex cursor-pointer items-center gap-3 border-b border-border/40 px-6 py-3 text-sm outline-none transition-colors",
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
								{/* The wrapping span (not the icon itself — react-icons
								    treats a `title` prop as an SVG <title> child, not an
								    HTML attribute, so it can't block inheritance) carries
								    an empty title to stop it from inheriting the row's
								    title (PR/branch/project); without it, hovering this
								    icon fires both the native tooltip and this Radix one
								    at once. */}
								<span title="">
									<CgLaptop
										className="size-3.5 shrink-0 text-muted-foreground"
										aria-label={t({
											message: "Main workspace",
										})}
									/>
								</span>
							</TooltipTrigger>
							<TooltipContent side="top">
								<Trans>Main workspace</Trans>
							</TooltipContent>
						</Tooltip>
					) : null}

					<WorkspaceNameMarquee
						name={workspace.name}
						forceActive={isFocused}
						className={cn(
							"min-w-0 flex-1 font-medium",
							// Done states recede so live work owns the contrast.
							workspace.archivedAt != null || workspace.pr?.state === "merged"
								? "text-muted-foreground"
								: "text-foreground",
						)}
					/>

					{workspace.pr ? (
						<a
							href={workspace.pr.url}
							target="_blank"
							rel="noreferrer"
							onClick={(event) => event.stopPropagation()}
							title=""
							aria-label={t({
								message: `Pull request #${workspace.pr.prNumber}, ${workspace.pr.state}`,
							})}
							className="shrink-0"
						>
							<PRIcon state={workspace.pr.state} className="size-3.5" />
						</a>
					) : null}

					{workspace.diffStats &&
					(workspace.diffStats.additions > 0 ||
						workspace.diffStats.deletions > 0) ? (
						<span
							className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums leading-none"
							title={t({
								message: plural(workspace.diffStats.fileCount, {
									one: "# changed file",
									other: "# changed files",
								}),
							})}
						>
							<span className="text-emerald-600/80 dark:text-emerald-400/70">
								+{formatCount(workspace.diffStats.additions)}
							</span>
							<span className="text-red-600/80 dark:text-red-400/70">
								−{formatCount(workspace.diffStats.deletions)}
							</span>
						</span>
					) : null}

					<span
						className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground"
						title={timeTitle}
					>
						{timeLabel}
					</span>
				</div>
			)}
		</V2WorkspaceContextMenu>
	);
}
