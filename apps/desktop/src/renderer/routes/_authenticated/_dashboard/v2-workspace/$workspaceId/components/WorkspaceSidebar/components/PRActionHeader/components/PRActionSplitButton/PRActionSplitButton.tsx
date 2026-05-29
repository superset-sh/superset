import type { HostAgentConfig } from "@superset/host-service/settings";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import {
	VscChevronDown,
	VscEdit,
	VscGitPullRequest,
	VscLoading,
} from "react-icons/vsc";
import type { AgentTarget } from "renderer/hooks/agents/useAgentTarget";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { PRAgentPickerMenu } from "./components/PRAgentPickerMenu";
import { PRPromptEditDialog } from "./components/PRPromptEditDialog";

type SplitButtonKind = "create" | "update";

interface PRActionSplitButtonProps {
	kind: SplitButtonKind;
	workspaceId: string;
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
	/** Deep-link for the "Open in editor" affordance inside the
	 *  Edit-prompt dialog. */
	onOpenPromptInEditor?: (absolutePath: string) => void;
	/** Disables the primary + swaps the action icon for a spinner. */
	busy?: boolean;
	/** When set, the primary is disabled and the tooltip shows this reason
	 *  instead of the normal copy. Agent picker chevron stays enabled so
	 *  the user can force-dispatch via a specific agent. */
	disabledReason?: string;
}

/**
 * Bordered icon+label group with a chevron, mirroring the v1 PRButton and
 * the v2 PRStatusGroup pill so the action slot reads as a single family.
 *
 * Primary fires the default agent (last-picked existing terminal or new
 * preset; chat tab as a fallback); chevron exposes the picker. When
 * `disabledReason` is set, the primary is disabled with a tooltip
 * reason but the chevron stays enabled so the user can still force-
 * dispatch via a specific agent.
 *
 * For *synced* / *merged* / *closed* PRs the action slot doesn't render
 * this component at all — `PRStatusGroup` is the view affordance.
 */
export function PRActionSplitButton({
	kind,
	workspaceId,
	sessions,
	configs,
	selectedValue,
	resolvedTarget,
	onPickTarget,
	onSubmit,
	onOpenPromptInEditor,
	busy = false,
	disabledReason,
}: PRActionSplitButtonProps) {
	const copy = labels(kind, busy, disabledReason);
	const [promptDialogOpen, setPromptDialogOpen] = useState(false);
	const isDisabled = busy || Boolean(disabledReason);
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
						disabled={isDisabled}
						aria-label={copy.primaryAriaLabel}
						className="flex items-center gap-1.5 px-1.5 py-0.5 text-xs text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:cursor-default disabled:opacity-70 disabled:hover:bg-transparent"
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
						onEditPrompt={() => setPromptDialogOpen(true)}
					/>
				</DropdownMenuContent>
			</DropdownMenu>
			<PRPromptEditDialog
				workspaceId={workspaceId}
				open={promptDialogOpen}
				onOpenChange={setPromptDialogOpen}
				onOpenInEditor={onOpenPromptInEditor}
			/>
		</div>
	);
}

function labels(
	kind: SplitButtonKind,
	busy: boolean,
	disabledReason: string | undefined,
) {
	const verbing = kind === "create" ? "Creating…" : "Updating…";
	const verb = kind === "create" ? "Create PR" : "Update PR";
	const action = kind === "create" ? "create" : "update";
	return {
		primaryLabel: busy ? verbing : verb,
		primaryAriaLabel: `${verb} with agent`,
		primaryTooltip: busy
			? `Agent is ${action === "create" ? "creating" : "updating"} the PR`
			: (disabledReason ?? `${verb} with agent`),
		chevronAriaLabel: `Choose which agent ${action}s the PR`,
	};
}
