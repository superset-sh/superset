import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	LuArrowUpRight,
	LuChevronDown,
	LuGitPullRequest,
} from "react-icons/lu";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import type { PRFlowDispatch } from "../../hooks/usePRFlowDispatch";
import {
	type PRFlowState,
	selectActionButton,
	selectPRLink,
	selectStatusBadge,
} from "./utils/getPRFlowState";

interface PRActionHeaderProps {
	state: PRFlowState;
	dispatch: PRFlowDispatch;
	onRetry?: () => void;
	onCancelBusy?: () => void;
}

export function PRActionHeader({
	state,
	dispatch,
	onRetry,
	onCancelBusy,
}: PRActionHeaderProps) {
	const prLink = selectPRLink(state);
	const badge = selectStatusBadge(state);
	const action = selectActionButton(state);

	return (
		<div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-muted/45 px-2 dark:bg-muted/35">
			<div className="flex min-w-0 items-center gap-1.5">
				{prLink.kind === "pr-link" && (
					<a
						href={prLink.url}
						target="_blank"
						rel="noopener noreferrer"
						className="group flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-accent"
						title={`Open #${prLink.number} on GitHub`}
					>
						<PRIcon state={prLink.state} className="size-3.5" />
						<span className="font-mono text-[11px] text-muted-foreground">
							#{prLink.number}
						</span>
						<LuArrowUpRight
							aria-hidden="true"
							className="size-3 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100"
						/>
					</a>
				)}
				{badge && (
					<span className="truncate text-[11px] text-muted-foreground">
						{badge}
					</span>
				)}
			</div>

			<div className="ml-auto flex items-center">
				<ActionButton
					variant={action}
					state={state}
					dispatch={dispatch}
					onRetry={onRetry}
					onCancelBusy={onCancelBusy}
				/>
			</div>
		</div>
	);
}

function ActionButton({
	variant,
	state,
	dispatch,
	onRetry,
	onCancelBusy,
}: {
	variant: ReturnType<typeof selectActionButton>;
	state: PRFlowState;
	dispatch: PRFlowDispatch;
	onRetry?: () => void;
	onCancelBusy?: () => void;
}) {
	switch (variant.kind) {
		case "hidden":
			return null;

		case "disabled-tooltip":
			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex">
							<Button
								size="sm"
								variant="outline"
								disabled
								className={cn("h-7 gap-1 text-xs", "opacity-60")}
							>
								<LuGitPullRequest className="size-3.5" />
								Create PR
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent side="bottom">{variant.reason}</TooltipContent>
				</Tooltip>
			);

		case "create-pr-dropdown":
			return <CreatePRSplitButton state={state} dispatch={dispatch} />;

		case "cancel-busy":
			return (
				<Button
					size="sm"
					variant="outline"
					className="h-7 text-xs"
					onClick={onCancelBusy}
				>
					Cancel
				</Button>
			);

		case "retry":
			return (
				<Button
					size="sm"
					variant="outline"
					className="h-7 text-xs"
					onClick={onRetry}
				>
					Retry
				</Button>
			);
	}
}

function CreatePRSplitButton({
	state,
	dispatch,
}: {
	state: PRFlowState;
	dispatch: PRFlowDispatch;
}) {
	return (
		<div className="flex items-stretch overflow-hidden rounded border border-border">
			<button
				type="button"
				className="flex items-center gap-1 px-2 py-1 text-xs font-medium hover:bg-accent"
				onClick={() => dispatch({ state, draft: false })}
			>
				<LuGitPullRequest className="size-3.5" />
				Create PR
			</button>
			<div className="w-px bg-border" />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="Create PR options"
						className="flex items-center px-1 hover:bg-accent"
					>
						<LuChevronDown className="size-3.5 text-muted-foreground" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuItem
						className="text-xs"
						onClick={() => dispatch({ state, draft: false })}
					>
						<LuGitPullRequest className="size-3.5" />
						Create PR
					</DropdownMenuItem>
					<DropdownMenuItem
						className="text-xs"
						onClick={() => dispatch({ state, draft: true })}
					>
						<LuGitPullRequest className="size-3.5" />
						Create draft PR
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
