import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { VscGitPullRequest, VscLoading } from "react-icons/vsc";
import { V2WorkspaceOpenInButton } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/V2WorkspaceOpenInButton";
import { PRStatusGroup } from "./components/PRStatusGroup";
import {
	type PRFlowState,
	selectActionButton,
	type UnavailableReason,
} from "./utils/getPRFlowState";

interface PRActionHeaderProps {
	workspaceId: string;
	state: PRFlowState;
	onRetry?: () => void;
}

export function PRActionHeader({
	workspaceId,
	state,
	onRetry,
}: PRActionHeaderProps) {
	const action = selectActionButton(state);

	return (
		<div className="@container flex h-10 shrink-0 items-center gap-2 bg-muted/45 px-2 dark:bg-muted/35">
			<div className="drag h-full min-w-0 flex-1" />
			<div className="flex items-center gap-2">
				<V2WorkspaceOpenInButton workspaceId={workspaceId} />
				<ActionSlot
					variant={action}
					state={state}
					onRetry={onRetry}
					workspaceId={workspaceId}
				/>
			</div>
		</div>
	);
}

/**
 * Mirrors v1's PRButton state machine using just icons. PR-state, CI/review
 * detail, and copy all live in the hover card surfaced from PRStatusGroup —
 * the bar itself stays quiet at rest.
 */
function ActionSlot({
	variant,
	state,
	onRetry,
	workspaceId,
}: {
	variant: ReturnType<typeof selectActionButton>;
	state: PRFlowState;
	onRetry?: () => void;
	workspaceId: string;
}) {
	const { t } = useLingui();
	switch (variant.kind) {
		case "hidden":
			// `pr-exists` lands here — render the link + indicators + dropdown.
			return (
				<PRStatusGroup
					state={state}
					workspaceId={workspaceId}
					onRefresh={onRetry}
				/>
			);

		case "disabled-tooltip":
			return <UnavailableIcon reason={variant.reasonKind} />;

		case "create-pr-dropdown":
			return (
				<UnavailableIcon
					reason="create-disabled"
					tooltip={t({
						id: "workspace.prActionHeader.createPrComingSoon",
						message: "Create PR coming soon",
					})}
				/>
			);

		case "cancel-busy":
			return (
				<>
					<PRStatusGroup
						state={state}
						workspaceId={workspaceId}
						onRefresh={onRetry}
					/>
					<VscLoading className="ml-1.5 size-4 animate-spin text-muted-foreground" />
				</>
			);

		case "retry":
			return (
				<button
					type="button"
					onClick={onRetry}
					aria-label={t({
						id: "workspace.prActionHeader.retryLoadingPr",
						message: "Retry loading pull request",
					})}
					className="flex items-center text-muted-foreground/60 transition-colors hover:text-muted-foreground"
				>
					<VscGitPullRequest className="size-4" />
				</button>
			);
	}
}

function UnavailableIcon({
	reason,
	tooltip,
}: {
	reason: UnavailableReason | "create-disabled";
	tooltip?: string;
}) {
	const tooltipText = tooltip ?? unavailableTooltip(reason);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="flex items-center text-muted-foreground/40">
					<VscGitPullRequest className="size-4" />
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom">{tooltipText}</TooltipContent>
		</Tooltip>
	);
}

function unavailableTooltip(
	reason: UnavailableReason | "create-disabled",
): string {
	switch (reason) {
		case "no-repo":
			return i18n._({
				id: "workspace.prActionHeader.noRepoTooltip",
				message: "No GitHub repository connected",
			});
		case "default-branch":
			return i18n._({
				id: "workspace.prActionHeader.defaultBranchTooltip",
				message: "Switch to a feature branch to create a pull request",
			});
		case "detached-head":
			return i18n._({
				id: "workspace.prActionHeader.detachedHeadTooltip",
				message: "Checkout a branch to create a pull request",
			});
		case "create-disabled":
			return i18n._({
				id: "workspace.prActionHeader.createPrComingSoon",
				message: "Create PR coming soon",
			});
	}
}
