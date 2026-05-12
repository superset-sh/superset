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

const V2_WORKSPACE_NAVIGATION_DEBOUNCE_MS = 75;

interface PendingV2WorkspaceNavigation {
	workspaceId: string;
	navigate: UseNavigateResult<string>;
	search: V2WorkspaceSearchParams;
	options: Omit<NavigateOptions, "to" | "params" | "search">;
	waiters: Array<{
		resolve: () => void;
		reject: (error: unknown) => void;
	}>;
}

let pendingV2WorkspaceNavigation: PendingV2WorkspaceNavigation | null = null;
let pendingV2WorkspaceNavigationTimer: ReturnType<typeof setTimeout> | null =
	null;

function observeNavigationFailure(
	promise: Promise<void>,
	context: string,
): Promise<void> {
	void promise.catch((error) => {
		console.warn(`[workspace-navigation] ${context} failed`, error);
	});
	return promise;
}

function hasSearchParams(search: V2WorkspaceSearchParams): boolean {
	return Object.values(search).some((value) => value !== undefined);
}

function runV2WorkspaceNavigation({
	workspaceId,
	navigate,
	search,
	options,
}: Omit<PendingV2WorkspaceNavigation, "waiters">): Promise<void> {
	return navigate({
		to: "/v2-workspace/$workspaceId",
		params: { workspaceId },
		search,
		...options,
	});
}

function scheduleV2WorkspaceNavigation(
	request: Omit<PendingV2WorkspaceNavigation, "waiters">,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const waiters = pendingV2WorkspaceNavigation?.waiters ?? [];
		waiters.push({ resolve, reject });
		pendingV2WorkspaceNavigation = { ...request, waiters };

		if (pendingV2WorkspaceNavigationTimer) {
			clearTimeout(pendingV2WorkspaceNavigationTimer);
		}

		pendingV2WorkspaceNavigationTimer = setTimeout(() => {
			const navigation = pendingV2WorkspaceNavigation;
			pendingV2WorkspaceNavigation = null;
			pendingV2WorkspaceNavigationTimer = null;

			if (!navigation) {
				resolve();
				return;
			}

			runV2WorkspaceNavigation(navigation).then(
				() => {
					for (const waiter of navigation.waiters) {
						waiter.resolve();
					}
				},
				(error) => {
					for (const waiter of navigation.waiters) {
						waiter.reject(error);
					}
				},
			);
		}, V2_WORKSPACE_NAVIGATION_DEBOUNCE_MS);
	});
}

function cancelPendingV2WorkspaceNavigation(): void {
	const navigation = pendingV2WorkspaceNavigation;
	pendingV2WorkspaceNavigation = null;
	if (pendingV2WorkspaceNavigationTimer) {
		clearTimeout(pendingV2WorkspaceNavigationTimer);
		pendingV2WorkspaceNavigationTimer = null;
	}

	for (const waiter of navigation?.waiters ?? []) {
		waiter.resolve();
	}
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
	const resolvedSearch = search ?? {};
	const shouldDebounce = !rest.replace && !hasSearchParams(resolvedSearch);

	if (!shouldDebounce) {
		cancelPendingV2WorkspaceNavigation();
	}

	return observeNavigationFailure(
		shouldDebounce
			? scheduleV2WorkspaceNavigation({
					workspaceId,
					navigate,
					search: resolvedSearch,
					options: rest,
				})
			: runV2WorkspaceNavigation({
					workspaceId,
					navigate,
					search: resolvedSearch,
					options: rest,
				}),
		`navigate to v2 workspace ${workspaceId}`,
	);
}
