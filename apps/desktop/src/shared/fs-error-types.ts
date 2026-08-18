/**
 * Machine-readable cause for filesystem TRPCErrors caused by the user's
 * environment (files vanishing mid-scan, permission walls, full disks).
 * Serialized to the renderer via the errorFormatter in lib/trpc.
 */
export type FsErrnoCode =
	| "ENOENT"
	| "EISDIR"
	| "ENOTDIR"
	| "EACCES"
	| "EPERM"
	| "ENOSPC"
	| "ETIMEDOUT";

export interface FsErrnoCause {
	kind: "FS_ERRNO";
	errno: FsErrnoCode;
}

export function isFsErrnoCause(value: unknown): value is FsErrnoCause {
	return (
		!!value &&
		typeof value === "object" &&
		(value as { kind?: unknown }).kind === "FS_ERRNO"
	);
}
