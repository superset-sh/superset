import type { HostAgentConfig } from "@superset/host-service/settings";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	VscChevronDown,
	VscEdit,
	VscGitPullRequest,
	VscLoading,
} from "react-icons/vsc";
import type { AgentTarget } from "renderer/hooks/agents/useAgentTarget";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { PRAgentPickerMenu } from "./components/PRAgentPickerMenu";

type SplitButtonKind = "create" | "update";

interface PRActionSplitButtonProps {
	kind: SplitButtonKind;
	sessions: TerminalAgentBinding[];
	configs: HostAgentConfig[];
	/** Currently-selected encoded value (`existing:<id>` | `new:<id>`) so the
	 *  active item can be marked in the menu. */
	selectedValue: string | null;
	resolvedTarget: AgentTarget | null;
	onPickTarget: (target: AgentTarget) => void;
	/** Fires the action with the currently-resolved target (or null fallback
	 *  → chat tab). The dispatch hook owns transport routing. */
	onSubmit: (target: AgentTarget | null) => void | Promise<void>;
	/** Disables the primary + swaps the action icon for a spinner. */
	busy?: boolean;
}

/**
 * Bordered icon+label group with a chevron, mirroring the v1 PRButton and
 * the v2 PRStatusGroup pill so the action slot reads as a single family.
 *
 * Every invocation runs through an agent — the primary region fires the
 * default agent (last-picked existing terminal or new preset; chat tab as
 * a fallback), and the chevron exposes the picker so the user can switch
 * the default.
 *
 * One component covers both no-pr ("Create PR") and pr-exists
 * ("Update PR") via the `kind` discriminant.
 */
export function PRActionSplitButton({
	kind,
	sessions,
	configs,
	selectedValue,
	resolvedTarget,
	onPickTarget,
	onSubmit,
	busy = false,
}: PRActionSplitButtonProps) {
	const copy = labels(kind, busy);
	const primaryHandler = () => void onSubmit(resolvedTarget);
	const handlePick = (target: AgentTarget) => {
		onPickTarget(target);
		void onSubmit(target);
	};

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
					<PRAgentPickerMenu
						sessions={sessions}
						configs={configs}
						value={selectedValue}
						onPickTarget={handlePick}
					/>
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
