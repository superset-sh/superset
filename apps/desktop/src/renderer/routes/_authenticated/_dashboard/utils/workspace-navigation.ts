import type {
	NavigateOptions,
	UseNavigateResult,
} from "@tanstack/react-router";

export interface WorkspaceSearchParams {
	tabId?: string;
	paneId?: string;
}

export interface V2WorkspaceSearchParams {
	terminalId?: string;
	chatSessionId?: string;
	focusRequestId?: string;
	openUrl?: string;
	openUrlTarget?: "current-tab" | "new-tab";
	openUrlRequestId?: string;
}

function observeNavigationFailure(
	promise: Promise<void>,
	context: string,
): Promise<void> {
	void promise.catch((error) => {
		console.warn(`[workspace-navigation] ${context} failed`, error);
	});
	return promise;
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
	return observeNavigationFailure(
		navigate({
			to: "/workspace/$workspaceId",
			params: { workspaceId },
			search: search ?? {},
			...rest,
		}),
		`navigate to workspace ${workspaceId}`,
	);
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
	return observeNavigationFailure(
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId },
			search: search ?? {},
			...rest,
		}),
		`navigate to v2 workspace ${workspaceId}`,
	);
}
