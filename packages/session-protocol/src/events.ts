import { z } from "zod";
import type { SessionPermissionResult } from "./permission-contract";
import type {
	ElicitationResult,
	SDKMessage,
	UserDialogResult,
} from "./sdk-types";
import {
	type PendingElicitationRequest,
	type PendingPermissionRequest,
	type PendingUserDialogRequest,
	pendingElicitationRequestSchema,
	pendingPermissionRequestSchema,
	pendingUserDialogRequestSchema,
	type SessionScopedState,
	sessionScopedStateSchema,
} from "./state";
import {
	elicitationResultSchema,
	permissionResultSchema,
	sdkMessageSchema,
	userDialogResultSchema,
} from "./validation";

export type SessionEventFrame =
	| { kind: "sdk"; message: SDKMessage }
	| { kind: "permission_requested"; request: PendingPermissionRequest }
	| {
			kind: "permission_resolved";
			requestId: string;
			response: SessionPermissionResult;
	  }
	| { kind: "user_dialog_requested"; request: PendingUserDialogRequest }
	| {
			kind: "user_dialog_resolved";
			requestId: string;
			response: UserDialogResult;
	  }
	| { kind: "elicitation_requested"; request: PendingElicitationRequest }
	| {
			kind: "elicitation_resolved";
			requestId: string;
			response: ElicitationResult;
	  }
	| { kind: "state"; state: SessionScopedState }
	| {
			kind: "reset";
			reason: string;
			/** Server's current tail, when known; useful for cursor-ahead repair. */
			latestSeq?: number;
	  };

export interface SessionEventEnvelope {
	/** Per-session journal sequence. Normal frames start at 1 and are gapless. */
	seq: number;
	sessionId: string;
	/** Host epoch time in milliseconds. */
	ts: number;
	frame: SessionEventFrame;
}

export const sessionEventFrameSchema: z.ZodType<SessionEventFrame> =
	z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("sdk"), message: sdkMessageSchema }),
		z.object({
			kind: z.literal("permission_requested"),
			request: pendingPermissionRequestSchema,
		}),
		z.object({
			kind: z.literal("permission_resolved"),
			requestId: z.string().min(1),
			response: permissionResultSchema,
		}),
		z.object({
			kind: z.literal("user_dialog_requested"),
			request: pendingUserDialogRequestSchema,
		}),
		z.object({
			kind: z.literal("user_dialog_resolved"),
			requestId: z.string().min(1),
			response: userDialogResultSchema,
		}),
		z.object({
			kind: z.literal("elicitation_requested"),
			request: pendingElicitationRequestSchema,
		}),
		z.object({
			kind: z.literal("elicitation_resolved"),
			requestId: z.string().min(1),
			response: elicitationResultSchema,
		}),
		z.object({ kind: z.literal("state"), state: sessionScopedStateSchema }),
		z.object({
			kind: z.literal("reset"),
			reason: z.string().min(1),
			latestSeq: z
				.number()
				.int()
				.nonnegative()
				.max(Number.MAX_SAFE_INTEGER)
				.optional(),
		}),
	]);

export const sessionEventEnvelopeSchema: z.ZodType<SessionEventEnvelope> = z
	.object({
		seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		sessionId: z.uuid(),
		ts: z.number().finite().nonnegative(),
		frame: sessionEventFrameSchema,
	})
	.superRefine((envelope, context) => {
		// Reset is an out-of-band repair signal and may use nominal seq 0.
		if (envelope.frame.kind !== "reset" && envelope.seq < 1) {
			context.addIssue({
				code: "custom",
				path: ["seq"],
				message: "normal session events must start at seq 1",
			});
		}
	});
