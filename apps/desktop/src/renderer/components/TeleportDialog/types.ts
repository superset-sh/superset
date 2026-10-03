import type { TeleportStepId } from "@superset/shared/teleport";

/**
 * The dialog is a three-phase machine and nothing else: picking, reviewing,
 * running. Keeping the phase as data — rather than a pile of booleans — is
 * what lets each step render from its own props and be tested alone.
 */
export type TeleportPhase =
	| { kind: "picking" }
	| { kind: "reviewing"; host: TeleportDestination }
	| { kind: "running"; host: TeleportDestination }
	| { kind: "done"; host: TeleportDestination }
	| { kind: "failed"; host: TeleportDestination; step: TeleportStepId };

/**
 * Where a workspace can go: a host someone owns, or a new cloud sandbox.
 * The two take different paths on the way in (host `workspaces.create` vs
 * the cloud API) and the dialog keeps them apart from the first click.
 */
export type TeleportDestination =
	| { kind: "host"; id: string; name: string; isOnline: boolean }
	| { kind: "cloud"; id: "cloud"; name: string };

export type TeleportStepState = "pending" | "running" | "done" | "failed";

export interface TeleportRunState {
	/** Step → state; a step absent from the map has not started. */
	steps: Partial<Record<TeleportStepId, TeleportStepState>>;
	/** Set when a step failed, for the message under the list. */
	error: string | null;
}
