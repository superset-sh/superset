import type {
	NavigateOptions,
	UseNavigateResult,
} from "@tanstack/react-router";
import {
	clearPendingV2WorkspaceNavigation,
	setPendingV2WorkspaceNavigation,
} from "renderer/stores/v2-workspace-navigation";

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

interface V2WorkspaceNavigationRequest {
	workspaceId: string;
	navigate: UseNavigateResult<string>;
	search: V2WorkspaceSearchParams;
	options: Omit<NavigateOptions, "to" | "params" | "search">;
}

interface QueuedV2WorkspaceNavigation extends V2WorkspaceNavigationRequest {
	waiters: Array<{
		resolve: () => void;
		reject: (error: unknown) => void;
	}>;
}

let inFlightV2WorkspaceNavigation: Promise<void> | null = null;
let queuedV2WorkspaceNavigation: QueuedV2WorkspaceNavigation | null = null;

export function resetV2WorkspaceNavigationStateForTesting(): void {
	inFlightV2WorkspaceNavigation = null;
	queuedV2WorkspaceNavigation = null;
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

function hasSearchParams(search: V2WorkspaceSearchParams): boolean {
	return Object.values(search).some((value) => value !== undefined);
}

function runV2WorkspaceNavigation({
	workspaceId,
	navigate,
	search,
	options,
}: V2WorkspaceNavigationRequest): Promise<void> {
	return navigate({
		to: "/v2-workspace/$workspaceId",
		params: { workspaceId },
		search,
		...options,
	});
}

function completeWaiters(
	waiters: QueuedV2WorkspaceNavigation["waiters"],
	result: { status: "resolved" } | { status: "rejected"; error: unknown },
): void {
	for (const waiter of waiters) {
		if (result.status === "resolved") {
			waiter.resolve();
		} else {
			waiter.reject(result.error);
		}
	}
}

function drainQueuedV2WorkspaceNavigation(): void {
	if (inFlightV2WorkspaceNavigation || !queuedV2WorkspaceNavigation) return;

	const navigation = queuedV2WorkspaceNavigation;
	queuedV2WorkspaceNavigation = null;
	const promise = startV2WorkspaceNavigation(navigation);
	promise.then(
		() => completeWaiters(navigation.waiters, { status: "resolved" }),
		(error) =>
			completeWaiters(navigation.waiters, { status: "rejected", error }),
	);
}

function startV2WorkspaceNavigation(
	request: V2WorkspaceNavigationRequest,
): Promise<void> {
	const promise = runV2WorkspaceNavigation(request);
	inFlightV2WorkspaceNavigation = promise;
	void promise.then(
		() => {
			if (inFlightV2WorkspaceNavigation !== promise) return;
			inFlightV2WorkspaceNavigation = null;
			drainQueuedV2WorkspaceNavigation();
		},
		() => {
			if (inFlightV2WorkspaceNavigation !== promise) return;
			inFlightV2WorkspaceNavigation = null;
			drainQueuedV2WorkspaceNavigation();
		},
	);
	return promise;
}

function queueV2WorkspaceNavigation(
	request: V2WorkspaceNavigationRequest,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const waiters = queuedV2WorkspaceNavigation?.waiters ?? [];
		waiters.push({ resolve, reject });
		queuedV2WorkspaceNavigation = { ...request, waiters };
	});
}

function cancelQueuedV2WorkspaceNavigation(): void {
	const navigation = queuedV2WorkspaceNavigation;
	queuedV2WorkspaceNavigation = null;
	completeWaiters(navigation?.waiters ?? [], { status: "resolved" });
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
	const isPlainWorkspaceSwitch =
		!rest.replace && !hasSearchParams(resolvedSearch);

	setPendingV2WorkspaceNavigation(workspaceId);

	if (!isPlainWorkspaceSwitch) {
		cancelQueuedV2WorkspaceNavigation();
	}

	const promise =
		isPlainWorkspaceSwitch && inFlightV2WorkspaceNavigation
			? queueV2WorkspaceNavigation({
					workspaceId,
					navigate,
					search: resolvedSearch,
					options: rest,
				})
			: startV2WorkspaceNavigation({
					workspaceId,
					navigate,
					search: resolvedSearch,
					options: rest,
				});

	void promise.then(
		() => clearPendingV2WorkspaceNavigation(workspaceId),
		() => clearPendingV2WorkspaceNavigation(workspaceId),
	);

	return observeNavigationFailure(
		promise,
		`navigate to v2 workspace ${workspaceId}`,
	);
}
