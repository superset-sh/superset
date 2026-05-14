import {
	REMOTE_CONTROL_MAX_TTL_SEC,
	REMOTE_CONTROL_MIN_TTL_SEC,
} from "@superset/shared/remote-control-protocol";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	listActiveSessions,
	mintRemoteControlToken,
	registerRemoteControlSession,
	revokeSession,
} from "../../../terminal/remote-control/session-manager";
import { terminalSessionExists } from "../../../terminal/terminal";
import { protectedProcedure, router } from "../../index";

const mintTokenInput = z.object({
	sessionId: z.string().uuid(),
	terminalId: z.string().min(1),
	workspaceId: z.string().uuid(),
	mode: z.enum(["command", "full"]),
	createdByUserId: z.string().uuid(),
	// Host is the final HMAC authority — clamp the schema here too so a
	// bug or compromised upstream caller cannot ask for a viewer credential
	// that outlives the documented limit. `mintRemoteControlToken` ALSO
	// clamps the value internally; this is a belt-and-braces guard at the
	// API boundary.
	ttlSec: z
		.number()
		.int()
		.min(REMOTE_CONTROL_MIN_TTL_SEC)
		.max(REMOTE_CONTROL_MAX_TTL_SEC)
		.optional(),
});

const revokeInput = z.object({
	sessionId: z.string().uuid(),
});

export const remoteControlRouter = router({
	mintToken: protectedProcedure.input(mintTokenInput).mutation(({ input }) => {
		if (!terminalSessionExists(input.terminalId, input.workspaceId)) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Terminal "${input.terminalId}" not found in workspace "${input.workspaceId}"`,
			});
		}
		const minted = mintRemoteControlToken({
			sessionId: input.sessionId,
			terminalId: input.terminalId,
			workspaceId: input.workspaceId,
			mode: input.mode,
			createdByUserId: input.createdByUserId,
			ttlSec: input.ttlSec,
		});
		registerRemoteControlSession({
			sessionId: input.sessionId,
			terminalId: input.terminalId,
			workspaceId: input.workspaceId,
			mode: input.mode,
			tokenHash: minted.tokenHash,
			expiresAt: minted.expiresAt,
		});
		return {
			token: minted.token,
			tokenHash: minted.tokenHash,
			expiresAt: minted.expiresAt,
		};
	}),

	revoke: protectedProcedure.input(revokeInput).mutation(({ input }) => {
		revokeSession(input.sessionId, "manual");
		return { sessionId: input.sessionId, status: "revoked" as const };
	}),

	listActive: protectedProcedure.query(() => listActiveSessions()),
});
