import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMemo } from "react";
import { VscGitPullRequest } from "react-icons/vsc";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import type { OpenChatFn } from "../../hooks/planDispatch";
import {
	type PRActionCreateNewAgentSession,
	PRActionSplitButton,
	usePRActionAgentTarget,
	usePRActionDispatch,
} from "./components/PRActionSplitButton";
import { PRStatusGroup } from "./components/PRStatusGroup";
import { useProjectPRPrompt } from "./hooks/useProjectPRPrompt";
import {
	type PRFlowState,
	selectActionButton,
	type UnavailableReason,
} from "./utils/getPRFlowState";

interface PRActionHeaderProps {
	workspaceId: string;
	state: PRFlowState;
	/** Opens a chat tab seeded with the slash command + pr-context.md
	 *  attachment. Used as the fallback transport when no agent target
	 *  is selected. */
	onOpenChat?: OpenChatFn;
	onRetry?: () => void;
	/** Host-side terminal-agent launcher. When omitted, "Start new" picks
	 *  surface an error toast. */
	onCreateNewAgentSession?: PRActionCreateNewAgentSession;
	/** Focus the target terminal pane after sending to an existing session
	 *  so the user can see the agent receive the prompt. */
	onFocusExistingTerminal?: (terminalId: string) => void;
	/** "Open in editor" deep-link inside the Edit-prompt dialog. */
	onOpenPromptInEditor?: (absolutePath: string) => void;
}

export function PRActionHeader({
	workspaceId,
	state,
	onOpenChat,
	onRetry,
	onCreateNewAgentSession,
	onFocusExistingTerminal,
	onOpenPromptInEditor,
}: PRActionHeaderProps) {
	const action = selectActionButton(state);

	// Agent picker data — same assembly as the DiffPane comment composer,
	// just with PR-action-scoped storage keys via usePRActionAgentTarget.
	const bindings = useTerminalAgentBindings(workspaceId);
	const sessions = useMemo(
		() =>
			Array.from(bindings.values()).sort(
				(a, b) => b.lastEventAt - a.lastEventAt,
			),
		[bindings],
	);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const {
		value: selectedValue,
		resolved: resolvedTarget,
		onValueChange,
	} = usePRActionAgentTarget({ sessions, configs });

	const projectPrompt = useProjectPRPrompt(workspaceId);
	const submit = usePRActionDispatch({
		workspaceId,
		onOpenChat,
		onCreateNewAgentSession,
		onFocusExistingTerminal,
		projectPrompt: projectPrompt.content ?? null,
	});

	const onPickTarget = (
		target: import("renderer/hooks/agents/useAgentTarget").AgentTarget,
	) => {
		onValueChange(
			target.kind === "existing"
				? `existing:${target.terminalId}`
				: `new:${target.configId}`,
		);
	};

	const splitButtonProps = {
		workspaceId,
		sessions,
		configs,
		selectedValue,
		resolvedTarget,
		onPickTarget,
		onSubmit: (
			target: import("renderer/hooks/agents/useAgentTarget").AgentTarget | null,
		) => submit({ state, target }),
		onOpenPromptInEditor,
	};

	return (
		<div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-muted/45 px-2 dark:bg-muted/35">
			<div className="ml-auto flex items-center">
				<ActionSlot
					variant={action}
					state={state}
					onRetry={onRetry}
					workspaceId={workspaceId}
					splitButtonProps={splitButtonProps}
				/>
			</div>
		</div>
	);
}

type SplitButtonProps = Omit<
	React.ComponentProps<typeof PRActionSplitButton>,
	"kind" | "busy" | "disabledReason" | "viewUrl"
>;

function ActionSlot({
	variant,
	state,
	onRetry,
	workspaceId,
	splitButtonProps,
}: {
	variant: ReturnType<typeof selectActionButton>;
	state: PRFlowState;
	onRetry?: () => void;
	workspaceId: string;
	splitButtonProps: SplitButtonProps;
}) {
	switch (variant.kind) {
		case "hidden":
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
			return <PRActionSplitButton kind="create" {...splitButtonProps} />;

		case "update-pr-dropdown":
			return (
				<>
					<PRActionSplitButton
						kind="update"
						disabledReason={variant.blockedReason}
						{...splitButtonProps}
					/>
					<div className="ml-2">
						<PRStatusGroup
							state={state}
							workspaceId={workspaceId}
							onRefresh={onRetry}
						/>
					</div>
				</>
			);

		case "view-pr":
			return (
				<>
					<PRActionSplitButton
						kind="view"
						viewUrl={variant.url}
						{...splitButtonProps}
					/>
					<div className="ml-2">
						<PRStatusGroup
							state={state}
							workspaceId={workspaceId}
							onRefresh={onRetry}
						/>
					</div>
				</>
			);

		case "cancel-busy": {
			// `busy` covers two cases: agent creating a PR (no pr yet) or agent
			// editing an existing one. Mirror the resting layout — pill + PR
			// status group — with the pill in a disabled+spinner state so the
			// header doesn't lose its anchor while the agent runs.
			const hasPR = state.kind === "busy" && state.pr !== null;
			return (
				<>
					<PRActionSplitButton
						kind={hasPR ? "update" : "create"}
						busy
						{...splitButtonProps}
					/>
					{hasPR && (
						<div className="ml-2">
							<PRStatusGroup
								state={state}
								workspaceId={workspaceId}
								onRefresh={onRetry}
							/>
						</div>
					)}
				</>
			);
		}

		case "retry":
			return (
				<button
					type="button"
					onClick={onRetry}
					aria-label="Retry loading pull request"
					className="flex items-center text-muted-foreground/60 transition-colors hover:text-muted-foreground"
				>
					<VscGitPullRequest className="size-4" />
				</button>
			);
	}
}

function UnavailableIcon({ reason }: { reason: UnavailableReason }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="flex items-center text-muted-foreground/40">
					<VscGitPullRequest className="size-4" />
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{unavailableTooltip(reason)}
			</TooltipContent>
		</Tooltip>
	);
}

function unavailableTooltip(reason: UnavailableReason): string {
	switch (reason) {
		case "no-repo":
			return "No GitHub repository connected";
		case "default-branch":
			return "Switch to a feature branch to create a pull request";
		case "detached-head":
			return "Checkout a branch to create a pull request";
	}
}
