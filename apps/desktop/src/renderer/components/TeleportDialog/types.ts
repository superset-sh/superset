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

export interface TeleportDestination {
	id: string;
	name: string;
	isOnline: boolean;
}

export type TeleportStepState = "pending" | "running" | "done" | "failed";

export interface TeleportRunState {
	/** Step → state; a step absent from the map has not started. */
	steps: Partial<Record<TeleportStepId, TeleportStepState>>;
	/** Set when a step failed, for the message under the list. */
	error: string | null;
}
