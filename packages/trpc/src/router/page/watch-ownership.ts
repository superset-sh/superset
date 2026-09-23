import { dbWs } from "@superset/db/client";
import {
	type PageWatchOwnership,
	pageComments,
	pageCommentThreads,
	pages,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { WATCH_STALE_MS } from "./watch";

const DELIVERY_LEASE_MS = 10_000;
type Transaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

async function lockedPage(tx: Transaction, id: string) {
	const [page] = await tx
		.select()
		.from(pages)
		.where(eq(pages.id, id))
		.for("update");
	if (!page) throw new TRPCError({ code: "NOT_FOUND" });
	const [clock] = await tx
		.select({ now: sql<string>`clock_timestamp()` })
		.from(pages)
		.where(eq(pages.id, id));
	if (!clock) throw new TRPCError({ code: "NOT_FOUND" });
	return { page, now: new Date(clock.now).getTime() };
}
function owns(
	state: PageWatchOwnership | null,
	token: string,
	heartbeat: Date | null,
	now: number,
): boolean {
	return (
		state?.token === token &&
		heartbeat !== null &&
		now - heartbeat.getTime() < WATCH_STALE_MS
	);
}
function assertUnreserved(state: PageWatchOwnership | null, now: number) {
	if (state?.reservation && state.reservation.expiresAt > now)
		throw new TRPCError({
			code: "CONFLICT",
			message: "Page feedback delivery is in progress",
		});
}
async function save(
	tx: Transaction,
	id: string,
	state: PageWatchOwnership,
	now: number,
) {
	await tx
		.update(pages)
		.set({ watchState: state, watchHeartbeatAt: new Date(now) })
		.where(eq(pages.id, id));
}
export async function claimPageWatch(input: {
	id: string;
	token: string;
	agentId: string | null;
}) {
	return dbWs.transaction(async (tx) => {
		const { page, now } = await lockedPage(tx, input.id);
		if (
			page.watchState &&
			owns(page.watchState, input.token, page.watchHeartbeatAt, now)
		) {
			await save(tx, input.id, page.watchState, now);
			return {
				token: input.token,
				seenCommentIds: page.watchState.seenCommentIds,
				pings: page.watchState.pings,
			};
		}
		assertUnreserved(page.watchState, now);
		const active =
			page.watchHeartbeatAt !== null &&
			now - page.watchHeartbeatAt.getTime() < WATCH_STALE_MS;
		let seenCommentIds =
			active && page.watchState ? page.watchState.seenCommentIds : [];
		const pings = active && page.watchState ? page.watchState.pings : {};
		if (!active || !page.watchState) {
			const comments = await tx
				.select({ id: pageComments.id })
				.from(pageComments)
				.innerJoin(
					pageCommentThreads,
					eq(pageComments.threadId, pageCommentThreads.id),
				)
				.where(
					and(
						eq(pageCommentThreads.pageId, input.id),
						eq(pageComments.authorKind, "human"),
					),
				);
			seenCommentIds = comments.map((c) => c.id);
		}
		const state: PageWatchOwnership = {
			token: input.token,
			seenCommentIds,
			pings,
			reservation: null,
			lastFinishedReservationId: null,
		};
		await tx
			.update(pages)
			.set({
				watchState: state,
				watchedByAgent: input.agentId,
				watchHeartbeatAt: new Date(now),
			})
			.where(eq(pages.id, input.id));
		return { token: input.token, seenCommentIds, pings };
	});
}
export async function renewPageWatch(input: { id: string; token: string }) {
	return dbWs.transaction(async (tx) => {
		const { page, now } = await lockedPage(tx, input.id);
		if (
			!page.watchState ||
			!owns(page.watchState, input.token, page.watchHeartbeatAt, now)
		)
			return { current: false };
		await save(tx, input.id, page.watchState, now);
		return { current: true };
	});
}
export async function releasePageWatch(input: { id: string; token: string }) {
	return dbWs.transaction(async (tx) => {
		const { page, now } = await lockedPage(tx, input.id);
		if (page.watchState?.token !== input.token) return { released: false };
		assertUnreserved(page.watchState, now);
		await tx
			.update(pages)
			.set({ watchState: null, watchedByAgent: null, watchHeartbeatAt: null })
			.where(eq(pages.id, input.id));
		return { released: true };
	});
}
export async function reservePageWatchDelivery(input: {
	id: string;
	token: string;
	commentIds: string[];
	pings: Record<string, number>;
}) {
	return dbWs.transaction(async (tx) => {
		const { page, now } = await lockedPage(tx, input.id);
		if (
			!page.watchState ||
			!owns(page.watchState, input.token, page.watchHeartbeatAt, now)
		)
			return null;
		assertUnreserved(page.watchState, now);
		const state = page.watchState;
		const ids = [...new Set(input.commentIds)];
		if (ids.length) {
			const valid = await tx
				.select({ id: pageComments.id })
				.from(pageComments)
				.innerJoin(
					pageCommentThreads,
					eq(pageComments.threadId, pageCommentThreads.id),
				)
				.where(
					and(
						eq(pageCommentThreads.pageId, input.id),
						eq(pageComments.authorKind, "human"),
						inArray(pageComments.id, ids),
					),
				);
			if (valid.length !== ids.length)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Comments do not belong to this page",
				});
		}
		const pingIds = Object.keys(input.pings);
		if (pingIds.length) {
			const threads = await tx
				.select({ id: pageCommentThreads.id })
				.from(pageCommentThreads)
				.where(
					and(
						eq(pageCommentThreads.pageId, input.id),
						inArray(pageCommentThreads.id, pingIds),
					),
				);
			if (
				threads.length !== pingIds.length ||
				Object.values(input.pings).some(
					(count) => !Number.isInteger(count) || count < 0 || count > 5,
				)
			)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid page thread ping count",
				});
		}
		const reservationId = crypto.randomUUID();
		state.reservation = {
			id: reservationId,
			expiresAt: now + DELIVERY_LEASE_MS,
			commentIds: ids,
			pings: input.pings,
		};
		await save(tx, input.id, state, now);
		return { reservationId, leaseMs: DELIVERY_LEASE_MS };
	});
}
export async function finishPageWatchDelivery(input: {
	id: string;
	token: string;
	reservationId: string;
	delivered: boolean;
}) {
	return dbWs.transaction(async (tx) => {
		const { page, now } = await lockedPage(tx, input.id);
		const state = page.watchState;
		if (state?.token !== input.token) return { current: false };
		if (state.lastFinishedReservationId === input.reservationId)
			return { current: true };
		if (state.reservation?.id !== input.reservationId)
			return { current: false };
		if (input.delivered) {
			state.seenCommentIds = [
				...new Set([...state.seenCommentIds, ...state.reservation.commentIds]),
			];
			for (const [id, at] of Object.entries(state.reservation.pings))
				state.pings[id] = Math.max(state.pings[id] ?? 0, at);
		}
		state.lastFinishedReservationId = input.reservationId;
		state.reservation = null;
		await save(tx, input.id, state, now);
		return { current: true };
	});
}
