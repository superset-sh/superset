import {
	AGENT_IDENTITY_IDS,
	type AgentIdentityId,
} from "@superset/shared/agent-catalog";
import type {
	NavigateOptions,
	UseNavigateResult,
} from "@tanstack/react-router";

export interface WorkspaceSearchParams {
	tabId?: string;
	paneId?: string;
}

/**
 * Deep link into a subagent's transcript pane. The sidebar cannot reach a
 * workspace's pane store, so it navigates with these and the workspace
 * page opens the pane (see useConsumeSubagentLink).
 */
export interface SubagentLinkParams {
	terminalId: string;
	subagentId: string;
	agentId: AgentIdentityId;
	agentType?: string;
}

export interface SubagentLinkSearchParams {
	subagentTerminalId?: string;
	subagentId?: string;
	subagentAgentId?: string;
	subagentType?: string;
}

export function buildSubagentSearch(
	link: SubagentLinkParams,
): SubagentLinkSearchParams {
	return {
		subagentTerminalId: link.terminalId,
		subagentId: link.subagentId,
		subagentAgentId: link.agentId,
		...(link.agentType ? { subagentType: link.agentType } : {}),
	};
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** The link's own fields from a raw search object, sanitized, for validateSearch. */
export function readSubagentSearch(
	raw: Record<string, unknown>,
): SubagentLinkSearchParams {
	return {
		subagentTerminalId: nonEmptyString(raw.subagentTerminalId),
		subagentId: nonEmptyString(raw.subagentId),
		subagentAgentId: nonEmptyString(raw.subagentAgentId),
		subagentType: nonEmptyString(raw.subagentType),
	};
}

/** The subagent link in a search object, or undefined when absent or malformed. */
export function parseSubagentSearch(
	raw: Record<string, unknown>,
): SubagentLinkParams | undefined {
	const terminalId = nonEmptyString(raw.subagentTerminalId);
	const subagentId = nonEmptyString(raw.subagentId);
	const agentId = nonEmptyString(raw.subagentAgentId);
	if (!terminalId || !subagentId || !agentId) return undefined;
	if (!(AGENT_IDENTITY_IDS as readonly string[]).includes(agentId)) {
		return undefined;
	}
	const agentType = nonEmptyString(raw.subagentType);
	return {
		terminalId,
		subagentId,
		agentId: agentId as AgentIdentityId,
		...(agentType ? { agentType } : {}),
	};
}

export interface V2WorkspaceSearchParams extends SubagentLinkSearchParams {
	terminalId?: string;
	focusRequestId?: string;
	openUrl?: string;
	openUrlTarget?: "current-tab" | "new-tab";
	openUrlRequestId?: string;
}

/**
 * Navigate to a workspace and update localStorage to remember it as the last viewed workspace.
 * This ensures the workspace will be restored when the app is reopened.
 *
 * @param workspaceId - The ID of the workspace to navigate to
 * @param navigate - The navigate function from useNavigate()
 * @param options - Optional navigation options (replace, resetScroll, etc.)
 */
export function navigateToWorkspace(
	workspaceId: string,
	navigate: UseNavigateResult<string>,
	options?: Omit<NavigateOptions, "to" | "params"> & {
		search?: WorkspaceSearchParams;
	},
): Promise<void> {
	const { search, ...rest } = options ?? {};
	localStorage.setItem("lastViewedWorkspaceId", workspaceId);
	return navigate({
		to: "/workspace/$workspaceId",
		params: { workspaceId },
		search: search ?? {},
		...rest,
	});
}

/**
 * Navigate to a V2 workspace route.
 */
export function navigateToV2Workspace(
	workspaceId: string,
	navigate: UseNavigateResult<string>,
	options?: Omit<NavigateOptions, "to" | "params" | "search"> & {
		search?: V2WorkspaceSearchParams;
	},
): Promise<void> {
	const { search, ...rest } = options ?? {};
	return navigate({
		to: "/v2-workspace/$workspaceId",
		params: { workspaceId },
		search: search ?? {},
		...rest,
	});
}
