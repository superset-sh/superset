export const WORKSPACE_SWITCH_HOTKEY_THROTTLE_MS = 160;
export const WORKSPACE_SWITCH_HOTKEY_RELEASE_MS = 160;

export type WorkspaceSwitchDirection = "previous" | "next";

interface WorkspaceLike {
	id: string;
}

interface ShouldRunWorkspaceSwitchHotkeyInput {
	isNavigating: boolean;
	now: number;
	lastRunAt: number;
	minIntervalMs?: number;
}

export function shouldRunWorkspaceSwitchHotkey({
	isNavigating,
	now,
	lastRunAt,
	minIntervalMs = WORKSPACE_SWITCH_HOTKEY_THROTTLE_MS,
}: ShouldRunWorkspaceSwitchHotkeyInput): boolean {
	if (isNavigating) return false;
	return now - lastRunAt >= minIntervalMs;
}

export function getRelativeWorkspaceTarget<T extends WorkspaceLike>(
	workspaces: readonly T[],
	currentWorkspaceId: string | null,
	direction: WorkspaceSwitchDirection,
): T | null {
	if (!currentWorkspaceId || workspaces.length === 0) return null;
	const index = workspaces.findIndex(
		(workspace) => workspace.id === currentWorkspaceId,
	);
	if (index === -1) return null;

	const targetIndex =
		direction === "previous"
			? index <= 0
				? workspaces.length - 1
				: index - 1
			: index >= workspaces.length - 1
				? 0
				: index + 1;
	return workspaces[targetIndex] ?? null;
}
