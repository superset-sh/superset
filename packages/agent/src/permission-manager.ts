const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

type PermissionResult =
	| { behavior: "allow"; updatedInput: Record<string, unknown> }
	| { behavior: "deny"; message: string };

interface PendingPermission {
	resolve: (result: PermissionResult) => void;
	reject: (error: Error) => void;
	timeoutId: ReturnType<typeof setTimeout>;
}

const pendingPermissions = new Map<string, PendingPermission>();

export function getPendingPermission(
	toolUseId: string,
): PendingPermission | undefined {
	return pendingPermissions.get(toolUseId);
}

export function resolvePendingPermission({
	toolUseId,
	result,
}: {
	toolUseId: string;
	result: PermissionResult;
}): boolean {
	const pending = pendingPermissions.get(toolUseId);
	if (!pending) return false;

	pendingPermissions.delete(toolUseId);
	clearTimeout(pending.timeoutId);
	pending.resolve(result);
	return true;
}

export function createPermissionRequest({
	toolUseId,
	signal,
}: {
	toolUseId: string;
	signal: AbortSignal;
}): Promise<PermissionResult> {
	return new Promise<PermissionResult>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			pendingPermissions.delete(toolUseId);
			resolve({
				behavior: "deny",
				message: "Permission request timed out",
			});
		}, PERMISSION_TIMEOUT_MS);

		pendingPermissions.set(toolUseId, {
			resolve,
			reject,
			timeoutId,
		});

		signal.addEventListener(
			"abort",
			() => {
				pendingPermissions.delete(toolUseId);
				clearTimeout(timeoutId);
				reject(new Error("Aborted"));
			},
			{ once: true },
		);
	});
}
