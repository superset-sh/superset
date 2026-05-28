import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	VscChevronDown,
	VscEdit,
	VscGitPullRequest,
	VscLoading,
} from "react-icons/vsc";
import type { PRFlowDispatch } from "../../../../hooks/usePRFlowDispatch";
import type { PRFlowState } from "../../utils/getPRFlowState";

type SplitButtonKind = "create" | "update";

interface PRActionSplitButtonProps {
	kind: SplitButtonKind;
	state: PRFlowState;
	dispatch: PRFlowDispatch;
	/** Disables the primary + swaps the action icon for a spinner. */
	busy?: boolean;
}

/**
 * Bordered icon+label group with a chevron, mirroring the v1 PRButton and
 * the v2 PRStatusGroup pill so the action slot reads as a single family.
 *
 * Every invocation runs through an agent — the primary region fires the
 * default agent (today: a new chat tab with the `/pr/*` slash command +
 * `pr-context.md` attachment), and the chevron exposes the agent picker
 * so the user can route to a running session or a different preset.
 *
 * One component covers both no-pr ("Create PR") and pr-exists
 * ("Update PR") via the `kind` discriminant.
 */
export function PRActionSplitButton({
	kind,
	state,
	dispatch,
	busy = false,
}: PRActionSplitButtonProps) {
	const copy = labels(kind, busy);

	const primaryHandler = () => dispatch({ state, draft: false });

	const ActionIcon = kind === "create" ? VscGitPullRequest : VscEdit;

	return (
		<div
			className="flex items-center overflow-hidden rounded border border-border bg-muted/40"
			aria-busy={busy}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={primaryHandler}
						disabled={busy}
						aria-label={copy.primaryAriaLabel}
						className="flex items-center gap-1.5 px-1.5 py-0.5 text-xs text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:cursor-default disabled:opacity-70"
					>
						{busy ? (
							<VscLoading className="size-3.5 animate-spin text-muted-foreground" />
						) : (
							<ActionIcon className="size-3.5 text-muted-foreground" />
						)}
						<span className="font-medium">{copy.primaryLabel}</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">{copy.primaryTooltip}</TooltipContent>
			</Tooltip>
			<div className="h-full w-px self-stretch bg-border" />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={busy}
						aria-label={copy.chevronAriaLabel}
						className="flex items-center px-1 py-0.5 outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:cursor-default disabled:opacity-70"
					>
						<VscChevronDown className="size-3 text-muted-foreground" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56 text-xs">
					<DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
						Active sessions
					</DropdownMenuLabel>
					<DropdownMenuItem disabled className="text-xs text-muted-foreground">
						No agent sessions yet
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
						Start new
					</DropdownMenuLabel>
					<DropdownMenuItem disabled className="text-xs text-muted-foreground">
						Coming soon
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function labels(kind: SplitButtonKind, busy: boolean) {
	if (kind === "create") {
		return {
			primaryLabel: busy ? "Creating…" : "Create PR",
			primaryAriaLabel: "Create pull request with agent",
			primaryTooltip: busy
				? "Agent is creating the PR"
				: "Create PR with agent",
			chevronAriaLabel: "Choose which agent creates the PR",
		};
	}
	return {
		primaryLabel: busy ? "Updating…" : "Update PR",
		primaryAriaLabel: "Update pull request with agent",
		primaryTooltip: busy ? "Agent is updating the PR" : "Update PR with agent",
		chevronAriaLabel: "Choose which agent updates the PR",
	};
}
