import type {
	PermissionMode,
	PermissionResult,
	PermissionUpdate,
} from "./sdk-types";

/**
 * Permission modes Superset is prepared to expose to remote clients.
 *
 * Claude's `bypassPermissions` mode is intentionally absent: the SDK requires
 * a separate `allowDangerouslySkipPermissions` acknowledgement, and the host
 * does not yet have a policy boundary that can grant it safely.
 */
export const SESSION_PERMISSION_MODES = [
	"default",
	"acceptEdits",
	"plan",
	"dontAsk",
	"auto",
] as const satisfies readonly PermissionMode[];

export type SessionPermissionMode = (typeof SESSION_PERMISSION_MODES)[number];

type SetModePermissionUpdate = Extract<PermissionUpdate, { type: "setMode" }>;

/** A Claude permission update with dangerous mode escalation removed. */
export type SessionPermissionUpdate =
	| Exclude<PermissionUpdate, { type: "setMode" }>
	| (Omit<SetModePermissionUpdate, "mode"> & {
			mode: SessionPermissionMode;
	  });

type AllowPermissionResult = Extract<PermissionResult, { behavior: "allow" }>;

/** Permission response accepted across Superset's remote session boundary. */
export type SessionPermissionResult =
	| (Omit<AllowPermissionResult, "updatedPermissions"> & {
			updatedPermissions?: SessionPermissionUpdate[];
	  })
	| Extract<PermissionResult, { behavior: "deny" }>;

export function isSessionPermissionMode(
	mode: unknown,
): mode is SessionPermissionMode {
	return (
		typeof mode === "string" &&
		(SESSION_PERMISSION_MODES as readonly string[]).includes(mode)
	);
}

export function isSessionPermissionUpdate(
	update: PermissionUpdate,
): update is SessionPermissionUpdate {
	return update.type !== "setMode" || isSessionPermissionMode(update.mode);
}
