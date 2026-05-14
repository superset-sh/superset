import crypto from "node:crypto";
import { mintUserJwt } from "@superset/auth/server";
import { dbWs } from "@superset/db/client";
import {
	remoteControlSessionModeValues,
	remoteControlSessionStatusValues,
} from "@superset/db/enums";
import {
	users,
	v2Hosts,
	v2RemoteControlSessions,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	REMOTE_CONTROL_DEFAULT_TTL_SEC,
	REMOTE_CONTROL_MAX_TTL_SEC,
	REMOTE_CONTROL_MIN_TTL_SEC,
	REMOTE_CONTROL_TOKEN_PARAM,
} from "@superset/shared/remote-control-protocol";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import {
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "../../trpc";
import { relayMutation } from "../automation/relay-client";
import { requireActiveOrgMembership } from "../utils/active-org";

interface MintTokenResult {
	token: string;
	tokenHash: string;
	expiresAt: number;
}

const createInput = z.object({
	workspaceId: z.string().uuid(),
	terminalId: z.string().min(1),
	mode: z.enum(remoteControlSessionModeValues),
	ttlSec: z
		.number()
		.int()
		.min(REMOTE_CONTROL_MIN_TTL_SEC)
		.max(REMOTE_CONTROL_MAX_TTL_SEC)
		.optional(),
});

const sessionIdInput = z.object({ sessionId: z.string().uuid() });
const getInput = z.object({
	sessionId: z.string().uuid(),
	token: z.string().min(1),
});
const listInput = z.object({ workspaceId: z.string().uuid() });

function sha256Hex(input: string): string {
	return crypto.createHash("sha256").update(input).digest("hex");
}

function constantTimeHexEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	const ab = Buffer.from(a, "hex");
	const bb = Buffer.from(b, "hex");
	if (ab.length !== bb.length) return false;
	return crypto.timingSafeEqual(ab, bb);
}

// Fixed dummy used for constant-time compare when the row lookup misses,
// so that "session doesn't exist" and "session exists but wrong token"
// take the same amount of CPU and emit the same response. Prevents
// sessionId enumeration via timing or error-code differentiation.
const DUMMY_TOKEN_HASH = sha256Hex(
	"remote-control:nonexistent-session:not-a-real-token",
);

// Single generic response for both "session not found" and "wrong token"
// — see DUMMY_TOKEN_HASH. Always 401; never 404, so an attacker can't
// distinguish the two states.
function throwInvalidTokenError(): never {
	throw new TRPCError({
		code: "UNAUTHORIZED",
		message: "Invalid remote control session or token",
	});
}

function buildWebUrl(sessionId: string, token: string): string {
	const base = env.NEXT_PUBLIC_WEB_URL.replace(/\/$/, "");
	const t = encodeURIComponent(token);
	// Pass the bearer token as a URL fragment, not a query param. The
	// fragment is never sent to any server, never appears in `Referer`
	// when the viewer navigates away, and stays out of access logs.
	// The web viewer reads it client-side from `location.hash`.
	return `${base}/agents/remote-control/${sessionId}#${REMOTE_CONTROL_TOKEN_PARAM}=${t}`;
}

function buildWsUrl(routingKey: string, sessionId: string): string {
	const httpToWs = env.RELAY_URL.replace(/^http/, "ws").replace(/\/$/, "");
	return `${httpToWs}/hosts/${routingKey}/remote-control/${sessionId}`;
}

async function getWorkspaceWithHost(
	workspaceId: string,
	organizationId: string,
) {
	const ws = await dbWs.query.v2Workspaces.findFirst({
		where: and(
			eq(v2Workspaces.id, workspaceId),
			eq(v2Workspaces.organizationId, organizationId),
		),
	});
	if (!ws) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace not found in this organization",
		});
	}
	const host = await dbWs.query.v2Hosts.findFirst({
		where: and(
			eq(v2Hosts.organizationId, organizationId),
			eq(v2Hosts.machineId, ws.hostId),
		),
	});
	if (!host) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Host record missing for workspace",
		});
	}
	return { workspace: ws, host };
}

async function ensureUserOnHost(
	userId: string,
	organizationId: string,
	hostId: string,
) {
	const membership = await dbWs.query.v2UsersHosts.findFirst({
		where: and(
			eq(v2UsersHosts.organizationId, organizationId),
			eq(v2UsersHosts.userId, userId),
			eq(v2UsersHosts.hostId, hostId),
		),
	});
	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You are not a member of this host",
		});
	}
}

// Authoritative tear-down on the host. The cloud row should already be
// transitioned to `revoked` BEFORE calling this so future viewer attaches
// fail (via `get`) even if the host call below fails. Throwing here is
// deliberate: the host owns the in-memory session/viewer set, so if we
// can't reach it we cannot promise the user that connected viewers were
// disconnected. The caller surfaces this to the user, who can retry —
// the cloud UPDATE is gated on `status='active'`, so retries are idempotent.
async function callHostRevoke(args: {
	organizationId: string;
	hostId: string;
	sessionId: string;
	actorUserId: string;
	actorEmail?: string;
}): Promise<void> {
	const jwt = await mintUserJwt({
		userId: args.actorUserId,
		email: args.actorEmail,
		organizationIds: [args.organizationId],
		scope: "remote-control",
		ttlSeconds: 60,
	});
	const routingKey = buildHostRoutingKey(args.organizationId, args.hostId);
	await relayMutation<{ sessionId: string }, unknown>(
		{ relayUrl: env.RELAY_URL, hostId: routingKey, jwt, timeoutMs: 5000 },
		"terminal.remoteControl.revoke",
		{ sessionId: args.sessionId },
	);
}

export const remoteControlRouter = createTRPCRouter({
	create: protectedProcedure
		.input(createInput)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const { workspace, host } = await getWorkspaceWithHost(
				input.workspaceId,
				organizationId,
			);
			await ensureUserOnHost(userId, organizationId, host.machineId);

			const sessionId = crypto.randomUUID();
			const ttlSec = input.ttlSec ?? REMOTE_CONTROL_DEFAULT_TTL_SEC;

			const [owner] = await dbWs
				.select({ email: users.email })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			const jwt = await mintUserJwt({
				userId,
				email: owner?.email,
				organizationIds: [organizationId],
				scope: "remote-control",
				ttlSeconds: 300,
			});
			const routingKey = buildHostRoutingKey(organizationId, host.machineId);

			const minted = await relayMutation<
				{
					sessionId: string;
					terminalId: string;
					workspaceId: string;
					mode: "command" | "full";
					createdByUserId: string;
					ttlSec?: number;
				},
				MintTokenResult
			>(
				// Bound the host call so a stuck relay/host doesn't pin the
				// Share button in "Starting…" forever. Matches `revoke`.
				{ relayUrl: env.RELAY_URL, hostId: routingKey, jwt, timeoutMs: 5000 },
				"terminal.remoteControl.mintToken",
				{
					sessionId,
					terminalId: input.terminalId,
					workspaceId: input.workspaceId,
					mode: input.mode,
					createdByUserId: userId,
					ttlSec,
				},
			);

			const expiresAt = new Date(minted.expiresAt * 1000);
			// If the DB insert fails, the host already has a live session
			// keyed to a token-hash the cloud never persisted — invisible to
			// `listForWorkspace`/`revoke` until the host TTL sweep. Best-
			// effort revoke it on the host so the minted token is unusable.
			try {
				await dbWs.insert(v2RemoteControlSessions).values({
					id: sessionId,
					organizationId,
					hostId: host.machineId,
					workspaceId: workspace.id,
					terminalId: input.terminalId,
					createdByUserId: userId,
					mode: input.mode,
					status: "active",
					tokenHash: minted.tokenHash,
					expiresAt,
				});
			} catch (insertErr) {
				let orphanRevokeFailed = false;
				try {
					await callHostRevoke({
						organizationId,
						hostId: host.machineId,
						sessionId,
						actorUserId: userId,
						actorEmail: owner?.email,
					});
				} catch (revokeErr) {
					// Both the cloud INSERT and the orphan-cleanup host revoke
					// failed. The host still has a live session keyed to a
					// token-hash the cloud never persisted, invisible to
					// `listForWorkspace`/`revoke` until the host TTL sweep.
					// `console.error` with a structured marker so the log
					// scraper can alert. Use a distinct prefix so future
					// Sentry `captureConsoleIntegration` picks it up.
					orphanRevokeFailed = true;
					console.error("[remote-control:orphan-host-session]", {
						sessionId,
						hostId: host.machineId,
						organizationId,
						insertError:
							insertErr instanceof Error
								? insertErr.message
								: String(insertErr),
						revokeError:
							revokeErr instanceof Error
								? revokeErr.message
								: String(revokeErr),
					});
				}
				// Wrap the raw drizzle/pg error so its message (which often
				// contains constraint / column names — schema info) does
				// not leak to the client through tRPC's default serializer.
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: orphanRevokeFailed
						? "Failed to create remote control session; an orphan host session may still exist and will expire on its own."
						: "Failed to create remote control session.",
					cause: insertErr,
				});
			}

			return {
				sessionId,
				token: minted.token,
				expiresAt: expiresAt.toISOString(),
				webUrl: buildWebUrl(sessionId, minted.token),
				wsUrl: buildWsUrl(routingKey, sessionId),
				routingKey,
				mode: input.mode,
			};
		}),

	// `get` is intentionally `publicProcedure`: the share-link recipient is
	// often anonymous (a colleague's browser, a phone, a kiosk). Holding the
	// raw token IS the credential — we hash it and compare against the row's
	// `token_hash` in constant time. No org membership required, no other
	// fields exposed without proof of token possession.
	//
	// Implemented as a `mutation` (not `query`) so tRPC's `httpBatchLink`
	// puts the input — including the bearer token — in the request BODY
	// instead of serializing it into the URL query string, which would
	// otherwise land the token in server access logs and undo the
	// fragment-URL fix.
	get: publicProcedure.input(getInput).mutation(async ({ input }) => {
		const row = await dbWs.query.v2RemoteControlSessions.findFirst({
			where: eq(v2RemoteControlSessions.id, input.sessionId),
		});
		// Always run the constant-time compare — against the row's hash
		// when present, otherwise a fixed dummy — so missing-session and
		// wrong-token paths are indistinguishable in both timing and
		// response (single UNAUTHORIZED, generic message).
		const providedHash = sha256Hex(input.token);
		const expectedHash = row?.tokenHash ?? DUMMY_TOKEN_HASH;
		const matches = constantTimeHexEqual(providedHash, expectedHash);
		if (!row || !matches) throwInvalidTokenError();
		// Cloud-side gate: refuse to hand out a WS endpoint for sessions
		// that are revoked, expired, or past their TTL even if the sweep
		// hasn't promoted the row to `expired` yet. Host auth would also
		// reject the attach, but this is defense-in-depth and prevents
		// the viewer UI from taking the live-connect path at all.
		const effectiveStatus =
			row.status === "active" && row.expiresAt <= new Date()
				? "expired"
				: row.status;
		if (effectiveStatus !== "active") {
			return {
				sessionId: row.id,
				workspaceId: row.workspaceId,
				terminalId: row.terminalId,
				mode: row.mode,
				status: effectiveStatus,
				expiresAt: row.expiresAt.toISOString(),
				wsUrl: null,
				routingKey: null,
			};
		}
		const routingKey = buildHostRoutingKey(row.organizationId, row.hostId);
		return {
			sessionId: row.id,
			workspaceId: row.workspaceId,
			terminalId: row.terminalId,
			mode: row.mode,
			status: effectiveStatus,
			expiresAt: row.expiresAt.toISOString(),
			wsUrl: buildWsUrl(routingKey, row.id),
			routingKey,
		};
	}),

	// Owner / host-member revoke. Requires both an active org membership
	// AND host membership — otherwise an org member who isn't on the host
	// could revoke other people's sessions on a host they have no claim
	// to. Anonymous viewers reach `revokeWithToken` below instead.
	revoke: protectedProcedure
		.input(sessionIdInput)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const row = await dbWs.query.v2RemoteControlSessions.findFirst({
				where: and(
					eq(v2RemoteControlSessions.id, input.sessionId),
					eq(v2RemoteControlSessions.organizationId, organizationId),
				),
			});
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Remote control session not found",
				});
			}
			await ensureUserOnHost(userId, organizationId, row.hostId);
			// The cloud row gets revoked first so even if the host call fails,
			// future attaches via the host see "session not found" or are denied
			// when the host is told later via retry / re-sync.
			// Belt-and-braces: scope by org to defend against a row mutating
			// between the SELECT and the UPDATE, and gate on `status='active'`
			// so a re-revoke (or revoke-after-natural-expiry) doesn't
			// overwrite the original `revokedAt`/`revokedByUserId` or
			// transition an `expired` row to `revoked`.
			await dbWs
				.update(v2RemoteControlSessions)
				.set({
					status: "revoked",
					revokedAt: new Date(),
					revokedByUserId: userId,
				})
				.where(
					and(
						eq(v2RemoteControlSessions.id, input.sessionId),
						eq(v2RemoteControlSessions.organizationId, organizationId),
						eq(v2RemoteControlSessions.status, "active"),
					),
				);

			const [owner] = await dbWs
				.select({ email: users.email })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);
			try {
				await callHostRevoke({
					organizationId,
					hostId: row.hostId,
					sessionId: input.sessionId,
					actorUserId: userId,
					actorEmail: owner?.email,
				});
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						"Marked the session revoked, but could not reach the host to disconnect connected viewers. Retry to ensure viewers are disconnected.",
					cause: err,
				});
			}

			return { sessionId: input.sessionId, status: "revoked" as const };
		}),

	// Anonymous-viewer revoke. The bearer token IS the credential; if you
	// hold it, you have the same authority as whoever you got the link
	// from. We hash the token in constant time, then revoke the matching
	// row. `revokedByUserId` is left null because we don't know which (if
	// any) Superset user is on the other end of this WebSocket.
	revokeWithToken: publicProcedure
		.input(getInput)
		.mutation(async ({ input }) => {
			const row = await dbWs.query.v2RemoteControlSessions.findFirst({
				where: eq(v2RemoteControlSessions.id, input.sessionId),
			});
			// Single response for missing-row and wrong-token — see `get`
			// for the rationale.
			const providedHash = sha256Hex(input.token);
			const expectedHash = row?.tokenHash ?? DUMMY_TOKEN_HASH;
			const matches = constantTimeHexEqual(providedHash, expectedHash);
			if (!row || !matches) throwInvalidTokenError();
			await dbWs
				.update(v2RemoteControlSessions)
				.set({ status: "revoked", revokedAt: new Date() })
				.where(
					and(
						eq(v2RemoteControlSessions.id, input.sessionId),
						eq(v2RemoteControlSessions.organizationId, row.organizationId),
						eq(v2RemoteControlSessions.status, "active"),
					),
				);
			// Authoritative host tear-down using the row creator's identity
			// (the JWT only needs to be valid enough to traverse the relay).
			// If the host call fails we still keep the cloud row as `revoked`
			// — but we MUST surface the error so the viewer doesn't see a
			// success toast while still controlling the terminal.
			const [owner] = await dbWs
				.select({ email: users.email })
				.from(users)
				.where(eq(users.id, row.createdByUserId))
				.limit(1);
			try {
				await callHostRevoke({
					organizationId: row.organizationId,
					hostId: row.hostId,
					sessionId: input.sessionId,
					actorUserId: row.createdByUserId,
					actorEmail: owner?.email,
				});
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						"Marked the session revoked, but could not reach the host to disconnect connected viewers. Retry to ensure viewers are disconnected.",
					cause: err,
				});
			}
			return { sessionId: input.sessionId, status: "revoked" as const };
		}),

	// Lists sessions for a workspace, scoped to host members. Org-wide
	// visibility would let anyone in the org enumerate other people's
	// share sessions on hosts they don't belong to.
	listForWorkspace: protectedProcedure
		.input(listInput)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const workspace = await dbWs.query.v2Workspaces.findFirst({
				where: and(
					eq(v2Workspaces.id, input.workspaceId),
					eq(v2Workspaces.organizationId, organizationId),
				),
			});
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found in this organization",
				});
			}
			await ensureUserOnHost(userId, organizationId, workspace.hostId);
			const rows = await dbWs.query.v2RemoteControlSessions.findMany({
				where: and(
					eq(v2RemoteControlSessions.workspaceId, input.workspaceId),
					eq(v2RemoteControlSessions.organizationId, organizationId),
				),
				orderBy: [desc(v2RemoteControlSessions.createdAt)],
				limit: 50,
			});
			return rows.map((r) => ({
				sessionId: r.id,
				terminalId: r.terminalId,
				mode: r.mode,
				status: r.status,
				createdAt: r.createdAt.toISOString(),
				expiresAt: r.expiresAt.toISOString(),
				revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
			}));
		}),

	expireStale: protectedProcedure.mutation(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		// Idempotent — safe for cron / manual sweep.
		const updated = await dbWs
			.update(v2RemoteControlSessions)
			.set({ status: "expired" })
			.where(
				and(
					eq(v2RemoteControlSessions.organizationId, organizationId),
					eq(v2RemoteControlSessions.status, "active"),
					lt(v2RemoteControlSessions.expiresAt, new Date()),
				),
			)
			.returning({ id: v2RemoteControlSessions.id });
		return { count: updated.length };
	}),

	statuses: protectedProcedure.query(() => remoteControlSessionStatusValues),
});
