import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

const enabled = process.env.PAGE_WATCH_TEST_DATABASE_URL;
const suite = enabled ? describe : describe.skip;

suite("page watch ownership against isolated PostgreSQL", () => {
	let db: typeof import("@superset/db/client").dbWs;
	let schema: typeof import("@superset/db/schema");
	let watch: typeof import("./watch-ownership");
	let pageId: string;
	let threadId: string;
	let baselineId: string;
	const token = () => crypto.randomUUID();
	const claim = (owner: string) =>
		watch.claimPageWatch({ id: pageId, token: owner, agentId: null });
	beforeAll(async () => {
		if (!enabled) throw Error("An isolated test database is required");
		process.env.DATABASE_URL = enabled;
		process.env.DATABASE_URL_UNPOOLED = enabled;
		({ dbWs: db } = await import("@superset/db/client"));
		schema = await import("@superset/db/schema");
		watch = await import("./watch-ownership");
		const [org] = await db
			.select({ id: schema.organizations.id })
			.from(schema.organizations)
			.limit(1);
		if (!org) throw Error("Test branch needs an organization");
		pageId = crypto.randomUUID();
		threadId = crypto.randomUUID();
		baselineId = crypto.randomUUID();
		await db.insert(schema.pages).values({
			id: pageId,
			slug: `watch-test-${pageId}`,
			organizationId: org.id,
			title: "Watch protocol integration fixture",
		});
		const [version] = await db
			.insert(schema.pageVersions)
			.values({
				pageId,
				version: 1,
				storageKey: "test",
				contentType: "text/html",
				sizeBytes: 0,
				sha256: "test",
			})
			.returning();
		if (!version) throw Error("No version");
		await db.insert(schema.pageCommentThreads).values({
			id: threadId,
			pageId,
			pageVersionId: version.id,
			anchorKind: "page",
		});
		await db
			.insert(schema.pageComments)
			.values({ id: baselineId, threadId, body: "baseline" });
	}, 30000);
	afterAll(async () => {
		if (pageId)
			await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
	});
	test("claim snapshots server IDs, including backdated comments, and is idempotent", async () => {
		const owner = token();
		const initial = await claim(owner);
		expect(initial.seenCommentIds).toContain(baselineId);
		const later = crypto.randomUUID();
		await db
			.insert(schema.pageComments)
			.values({ id: later, threadId, body: "late", createdAt: new Date(0) });
		expect((await claim(owner)).seenCommentIds).not.toContain(later);
	});
	test("competing hosts serialize; stale renew and clear cannot affect winner", async () => {
		const a = token(),
			b = token();
		await Promise.all([claim(a), claim(b)]);
		const results = await Promise.all([
			watch.renewPageWatch({ id: pageId, token: a }),
			watch.renewPageWatch({ id: pageId, token: b }),
		]);
		expect(results.filter((r) => r.current)).toHaveLength(1);
		const loser = results[0]?.current ? b : a;
		expect(await watch.releasePageWatch({ id: pageId, token: loser })).toEqual({
			released: false,
		});
	});
	test("reserved delivery blocks takeover and release; success ack is idempotent", async () => {
		const owner = token();
		await claim(owner);
		const id = crypto.randomUUID();
		await db
			.insert(schema.pageComments)
			.values({ id, threadId, body: "deliver" });
		const grant = await watch.reservePageWatchDelivery({
			id: pageId,
			token: owner,
			commentIds: [id],
			pings: {},
		});
		expect(grant).not.toBeNull();
		if (!grant) throw Error("No grant");
		await expect(claim(token())).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			watch.releasePageWatch({ id: pageId, token: owner }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const ack = {
			id: pageId,
			token: owner,
			reservationId: grant.reservationId,
		};
		expect(
			await watch.finishPageWatchDelivery({ ...ack, delivered: true }),
		).toEqual({ current: true });
		expect(
			await watch.finishPageWatchDelivery({ ...ack, delivered: false }),
		).toEqual({ current: true });
		expect((await claim(token())).seenCommentIds).toContain(id);
	});
	test("failed delivery does not advance cursor", async () => {
		const owner = token();
		await claim(owner);
		const id = crypto.randomUUID();
		await db
			.insert(schema.pageComments)
			.values({ id, threadId, body: "retry" });
		const grant = await watch.reservePageWatchDelivery({
			id: pageId,
			token: owner,
			commentIds: [id],
			pings: {},
		});
		if (!grant) throw Error("No grant");
		await watch.finishPageWatchDelivery({
			id: pageId,
			token: owner,
			reservationId: grant.reservationId,
			delivered: false,
		});
		expect((await claim(token())).seenCommentIds).not.toContain(id);
	});
	test("expired reservation allows takeover and fences late completion", async () => {
		const owner = token();
		await claim(owner);
		const grant = await watch.reservePageWatchDelivery({
			id: pageId,
			token: owner,
			commentIds: [],
			pings: {},
		});
		if (!grant) throw Error("No grant");
		await db.execute(
			sql`UPDATE pages SET watch_state=jsonb_set(watch_state,'{reservation,expiresAt}','0') WHERE id=${pageId}`,
		);
		await claim(token());
		expect(
			await watch.finishPageWatchDelivery({
				id: pageId,
				token: owner,
				reservationId: grant.reservationId,
				delivered: true,
			}),
		).toEqual({ current: false });
		expect(
			await watch.reservePageWatchDelivery({
				id: pageId,
				token: owner,
				commentIds: [],
				pings: {},
			}),
		).toBeNull();
	});
	test("server expiry rejects renewal and delivery", async () => {
		const owner = token();
		await claim(owner);
		await db
			.update(schema.pages)
			.set({ watchHeartbeatAt: new Date(0) })
			.where(eq(schema.pages.id, pageId));
		expect(await watch.renewPageWatch({ id: pageId, token: owner })).toEqual({
			current: false,
		});
		expect(
			await watch.reservePageWatchDelivery({
				id: pageId,
				token: owner,
				commentIds: [],
				pings: {},
			}),
		).toBeNull();
	});
	test("rejects IDs from another page and invalid ping counts", async () => {
		const owner = token();
		await claim(owner);
		await expect(
			watch.reservePageWatchDelivery({
				id: pageId,
				token: owner,
				commentIds: [token()],
				pings: {},
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			watch.reservePageWatchDelivery({
				id: pageId,
				token: owner,
				commentIds: [],
				pings: { [threadId]: Date.now() },
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
	test("two simultaneous sends receive at most one reservation", async () => {
		const owner = token();
		await claim(owner);
		const results = await Promise.allSettled(
			[1, 2].map(() =>
				watch.reservePageWatchDelivery({
					id: pageId,
					token: owner,
					commentIds: [],
					pings: {},
				}),
			),
		);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const accepted = results.find((r) => r.status === "fulfilled");
		if (accepted?.status !== "fulfilled" || !accepted.value)
			throw Error("No grant");
		await watch.finishPageWatchDelivery({
			id: pageId,
			token: owner,
			reservationId: accepted.value.reservationId,
			delivered: false,
		});
	});
	test("ping counts survive takeover and never decrease on acknowledgement", async () => {
		const owner = token();
		await claim(owner);
		for (const count of [5, 2]) {
			const grant = await watch.reservePageWatchDelivery({
				id: pageId,
				token: owner,
				commentIds: [],
				pings: { [threadId]: count },
			});
			if (!grant) throw Error("No grant");
			await watch.finishPageWatchDelivery({
				id: pageId,
				token: owner,
				reservationId: grant.reservationId,
				delivered: true,
			});
		}
		expect((await claim(token())).pings[threadId]).toBe(5);
	});

	test("legacy heartbeat/clear cannot overwrite a token owner", async () => {
		const owner = token();
		await claim(owner);
		const updated = await db
			.update(schema.pages)
			.set({ watchHeartbeatAt: null, watchedByAgent: null })
			.where(
				and(
					eq(schema.pages.id, pageId),
					sql`${schema.pages.watchState} IS NULL`,
				),
			)
			.returning();
		expect(updated).toHaveLength(0);
		expect(await watch.renewPageWatch({ id: pageId, token: owner })).toEqual({
			current: true,
		});
	});
	test("two host managers use PostgreSQL ownership to deliver only to the replacement agent", async () => {
		const { PageWatchManager } = await import(
			"../../../../host-service/src/page-watch/page-watch-manager"
		);
		await db
			.update(schema.pages)
			.set({ watchState: null, watchHeartbeatAt: null, watchedByAgent: null })
			.where(eq(schema.pages.id, pageId));
		const delivered: { host: string; text: string }[] = [];
		const owners = new Map<string, string>();
		const reservations: { host: string; granted: boolean }[] = [];
		const releases: { host: string; released: boolean }[] = [];
		const makeManager = (host: string) => {
			const binding = {
				terminalId: crypto.randomUUID(),
				workspaceId: crypto.randomUUID(),
				agentId: "codex" as const,
				launchId: crypto.randomUUID(),
				startedAt: 1,
				lastEventAt: 1,
				lastEventType: "Stop",
			};
			const manager = new PageWatchManager({
				api: {
					claimWatch: async (input) => {
						owners.set(host, input.token);
						return watch.claimPageWatch(input);
					},
					renewWatch: watch.renewPageWatch,
					releaseWatch: async (input) => {
						const result = await watch.releasePageWatch(input);
						releases.push({ host, ...result });
						return result;
					},
					reserveWatchDelivery: async (input) => {
						const result = await watch.reservePageWatchDelivery(input);
						reservations.push({ host, granted: result !== null });
						return result;
					},
					finishWatchDelivery: watch.finishPageWatchDelivery,
					listThreads: async (id) => {
						const comments = await db
							.select({
								id: schema.pageComments.id,
								body: schema.pageComments.body,
								authorKind: schema.pageComments.authorKind,
								createdAt: schema.pageComments.createdAt,
							})
							.from(schema.pageComments)
							.innerJoin(
								schema.pageCommentThreads,
								eq(schema.pageComments.threadId, schema.pageCommentThreads.id),
							)
							.where(eq(schema.pageCommentThreads.pageId, id));
						return [
							{
								id: threadId,
								anchorKind: "page",
								anchor: null,
								anchorText: null,
								resolved: false,
								version: 1,
								comments: comments.map((c) => ({
									...c,
									authorName: "Test reader",
								})),
							},
						];
					},
				},
				getAgent: (id) => (id === binding.terminalId ? binding : undefined),
				isTerminalAlive: (terminalId, workspaceId) =>
					terminalId === binding.terminalId &&
					workspaceId === binding.workspaceId,
				isAgentBusy: () => false,
				sendToTerminal: async (input) => {
					const permit = await input.acquireDelivery();
					if (!permit?.isValid()) throw Error("Delivery no longer owned");
					delivered.push({ host, text: input.text });
				},
			});
			return {
				manager,
				assignment: {
					pageId,
					slug: "postgres-host-test",
					title: "Postgres host test",
					workspaceId: binding.workspaceId,
					terminalId: binding.terminalId,
					agentId: null,
				},
			};
		};
		const a = makeManager("host-a"),
			b = makeManager("host-b");
		try {
			await a.manager.assign(a.assignment);
			await b.manager.assign(b.assignment);
			const commentId = crypto.randomUUID();
			await db.insert(schema.pageComments).values({
				id: commentId,
				threadId,
				body: "HOST-B-ONLY 👍🏽 日本語",
				createdAt: new Date(0),
			});
			await Promise.all([a.manager.tick(), b.manager.tick()]);
			expect(delivered).toHaveLength(1);
			expect(delivered[0]?.host).toBe("host-b");
			expect(delivered[0]?.text).toContain("HOST-B-ONLY 👍🏽 日本語");
			expect(reservations).toContainEqual({ host: "host-a", granted: false });
			expect(reservations).toContainEqual({ host: "host-b", granted: true });
			await a.manager.unwatch(pageId);
			await a.manager.tick();
			expect(releases).toContainEqual({ host: "host-a", released: false });
			const owner = owners.get("host-b");
			if (!owner) throw Error("Missing replacement token");
			expect(await watch.renewPageWatch({ id: pageId, token: owner })).toEqual({
				current: true,
			});
			expect(
				(
					await watch.claimPageWatch({
						id: pageId,
						token: owner,
						agentId: null,
					})
				).seenCommentIds,
			).toContain(commentId);
			await Promise.all([a.manager.tick(), b.manager.tick()]);
			expect(delivered).toHaveLength(1);
		} finally {
			await Promise.all([a.manager.unwatch(pageId), b.manager.unwatch(pageId)]);
			a.manager.stop();
			b.manager.stop();
			await Promise.all([a.manager.tick(), b.manager.tick()]);
		}
	}, 15000);
});
