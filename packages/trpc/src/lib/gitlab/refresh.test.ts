import { afterAll, describe, expect, test } from "bun:test";
import { connections } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import {
	connectionFixture,
	fixtureUrl,
} from "./connection.fixture.integration";

describe.skipIf(!fixtureUrl)("native GitLab refresh wrapper", () => {
	let fixture: Awaited<ReturnType<typeof connectionFixture>>;
	const ready = fixtureUrl
		? connectionFixture().then((value) => {
				fixture = value;
			})
		: Promise.resolve();
	afterAll(async () => {
		await ready;
		await fixture?.close();
	});
	const credentials = {
		clientId: "FIXTURE_CLIENT_ID",
		clientSecret: "FIXTURE_CLIENT_SECRET",
		issuer: "https://gitlab.com",
	};
	async function oauth() {
		await ready;
		return fixture.seed({
			authMethod: "oauth2",
			refreshToken: await fixture.crypto.encryptSecret(
				"ONE_TIME_FIXTURE_GRANT",
			),
			tokenExpiresAt: new Date(0),
			state: {
				provider: "gitlab",
				host: "gitlab.com",
				groupPath: "Acme/Widget",
				auth: "oauth",
				webhookSecret: "OLD_FIXTURE_HOOK",
			},
		});
	}
	test("concurrent expired readers exchange one grant and atomically encrypt the rotated pair", async () => {
		const row = await oauth();
		let exchanges = 0;
		const options = {
			organizationId: row.organizationId,
			credentials,
			send: async (url: string | URL, init?: RequestInit) => {
				exchanges++;
				expect(String(url)).toBe("https://gitlab.com/oauth/token");
				expect(String(init?.body)).toContain(
					"refresh_token=ONE_TIME_FIXTURE_GRANT",
				);
				return Response.json({
					access_token: "ROTATED_FIXTURE_TOKEN",
					refresh_token: "ROTATED_FIXTURE_GRANT",
					expires_in: 7200,
				});
			},
		};
		expect(
			await Promise.all([
				fixture.refresh.refreshGitlabToken(row.id, options),
				fixture.refresh.refreshGitlabToken(row.id, options),
			]),
		).toEqual([
			{ disconnected: false, accessToken: "ROTATED_FIXTURE_TOKEN" },
			{ disconnected: false, accessToken: "ROTATED_FIXTURE_TOKEN" },
		]);
		expect(exchanges).toBe(1);
		const current = await fixture.db.query.connections.findFirst({
			where: eq(connections.id, row.id),
		});
		expect(current?.accessToken).not.toBe("ROTATED_FIXTURE_TOKEN");
		expect(current?.refreshToken).not.toBe("ROTATED_FIXTURE_GRANT");
		expect(await fixture.crypto.decryptSecret(current?.accessToken ?? "")).toBe(
			"ROTATED_FIXTURE_TOKEN",
		);
		expect(
			await fixture.crypto.decryptSecret(current?.refreshToken ?? ""),
		).toBe("ROTATED_FIXTURE_GRANT");
		expect(current?.tokenExpiresAt?.getTime()).toBeGreaterThan(
			Date.now() + 7000_000,
		);
	});
	test("server/transient errors preserve tokens while confirmed revoked grants disconnect", async () => {
		const transient = await oauth();
		await expect(
			fixture.refresh.refreshGitlabToken(transient.id, {
				credentials,
				send: async () =>
					Response.json({ error: "invalid_grant" }, { status: 503 }),
			}),
		).rejects.toMatchObject({ status: 503 });
		const unchanged = await fixture.db.query.connections.findFirst({
			where: eq(connections.id, transient.id),
		});
		expect(unchanged?.disconnectedAt).toBeNull();
		expect(unchanged?.accessToken).toBe(transient.accessToken);
		expect(unchanged?.refreshToken).toBe(transient.refreshToken);
		const revoked = await oauth();
		expect(
			await fixture.refresh.refreshGitlabToken(revoked.id, {
				credentials,
				send: async () =>
					Response.json({ error: "invalid_grant" }, { status: 400 }),
			}),
		).toEqual({ disconnected: true });
		expect(
			await fixture.db.query.connections.findFirst({
				where: eq(connections.id, revoked.id),
			}),
		).toMatchObject({ disconnectReason: "needs_reauth" });
	});
	test("foreign organizations, user-owned rows and other connectors never reach OAuth transport", async () => {
		const row = await oauth();
		const send = async () => {
			throw new Error("Unauthorized exchange");
		};
		expect(
			await fixture.refresh.refreshGitlabToken(row.id, {
				organizationId: "00000000-0000-0000-0000-000000000001",
				credentials,
				send,
			}),
		).toEqual({ disconnected: true });
		await ready;
		for (const overrides of [
			{ ownerKind: "user", externalUserId: "FIXTURE_USER" },
			{ connector: "github" },
		]) {
			const other = await fixture.seed(overrides);
			expect(
				await fixture.refresh.refreshGitlabToken(other.id, {
					credentials,
					send,
				}),
			).toEqual({ disconnected: true });
			expect(
				(
					await fixture.db.query.connections.findFirst({
						where: eq(connections.id, other.id),
					})
				)?.disconnectedAt,
			).toBeNull();
		}
	});
	test("an unexpired OAuth token skips exchange without needing configured client credentials", async () => {
		const row = await oauth();
		await fixture.db
			.update(connections)
			.set({ tokenExpiresAt: new Date(Date.now() + 7200_000) })
			.where(eq(connections.id, row.id));
		expect(
			await fixture.refresh.refreshGitlabToken(row.id, {
				send: async () => {
					throw new Error("Unneeded exchange");
				},
			}),
		).toEqual({ disconnected: false, accessToken: "OLD_FIXTURE_TOKEN" });
	});
	test("optional shared authorization rejects before decryption without disconnecting and default GitHub rows retain refresh behavior", async () => {
		await ready;
		const rejected = await fixture.seed({
			accessToken: "v1:CORRUPT_FIXTURE_CIPHERTEXT",
			tokenExpiresAt: new Date(Date.now() + 7200_000),
		});
		expect(
			await fixture.withRefreshedToken(rejected.id, {
				acceptConnection: (snapshot) => {
					expect(snapshot).toMatchObject({
						organizationId: rejected.organizationId,
						connector: "gitlab",
						ownerKind: "org",
					});
					return false;
				},
				exchange: async () => {
					throw new Error("Rejected row reached exchange");
				},
			}),
		).toEqual({ disconnected: true });
		expect(
			(
				await fixture.db.query.connections.findFirst({
					where: eq(connections.id, rejected.id),
				})
			)?.disconnectedAt,
		).toBeNull();
		const github = await fixture.seed({
			connector: "github",
			state: null,
			tokenExpiresAt: new Date(0),
		});
		expect(
			await fixture.withRefreshedToken(github.id, {
				exchange: async () => ({
					accessToken: "GITHUB_CONTROL_TOKEN",
					refreshToken: "GITHUB_CONTROL_GRANT",
					tokenExpiresAt: new Date(Date.now() + 7200_000),
				}),
			}),
		).toEqual({ disconnected: false, accessToken: "GITHUB_CONTROL_TOKEN" });
		expect(
			await fixture.withRefreshedToken(github.id, {
				exchange: async () => {
					throw new Error("Fresh default row unexpectedly exchanged");
				},
			}),
		).toEqual({ disconnected: false, accessToken: "GITHUB_CONTROL_TOKEN" });
	});
	test("the original Linear refresh caller retains rotation, fast-path, transient and revoked behavior", async () => {
		await ready;
		const originalFetch = globalThis.fetch;
		let requests = 0;
		let response = Response.json({
			access_token: "LINEAR_CONTROL_TOKEN",
			refresh_token: "LINEAR_CONTROL_GRANT",
			expires_in: 7200,
		});
		globalThis.fetch = Object.assign(
			async (input: string | URL | Request, init?: RequestInit) => {
				requests++;
				expect(String(input)).toBe("https://api.linear.app/oauth/token");
				expect(String(init?.body)).toContain("client_id=FIXTURE_LINEAR_CLIENT");
				return response;
			},
			{ preconnect: originalFetch.preconnect },
		);
		try {
			const rotating = await oauth();
			await fixture.db
				.update(connections)
				.set({ connector: "linear", state: null })
				.where(eq(connections.id, rotating.id));
			expect(await fixture.refreshLinearToken(rotating.id)).toEqual({
				disconnected: false,
				accessToken: "LINEAR_CONTROL_TOKEN",
			});
			expect(await fixture.refreshLinearToken(rotating.id)).toEqual({
				disconnected: false,
				accessToken: "LINEAR_CONTROL_TOKEN",
			});
			expect(requests).toBe(1);
			const current = await fixture.db.query.connections.findFirst({
				where: eq(connections.id, rotating.id),
			});
			expect(
				await fixture.crypto.decryptSecret(current?.refreshToken ?? ""),
			).toBe("LINEAR_CONTROL_GRANT");
			const transient = await oauth();
			await fixture.db
				.update(connections)
				.set({ connector: "linear", state: null })
				.where(eq(connections.id, transient.id));
			response = Response.json({}, { status: 503 });
			await expect(
				fixture.refreshLinearToken(transient.id),
			).rejects.toMatchObject({ status: 503 });
			expect(
				(
					await fixture.db.query.connections.findFirst({
						where: eq(connections.id, transient.id),
					})
				)?.disconnectedAt,
			).toBeNull();
			response = Response.json({ error: "invalid_grant" }, { status: 400 });
			expect(await fixture.refreshLinearToken(transient.id)).toEqual({
				disconnected: true,
			});
			expect(
				(
					await fixture.db.query.connections.findFirst({
						where: eq(connections.id, transient.id),
					})
				)?.disconnectReason,
			).toBe("invalid_grant");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
	test("queued expired OAuth refresh preserves a PAT reconnect ahead of it with and without expiry", async () => {
		for (const expiresAt of [null, new Date(Date.now() + 7200_000)]) {
			const row = await oauth();
			let unlock = () => {};
			const release = new Promise<void>((resolve) => {
				unlock = resolve;
			});
			let locked = () => {};
			const entered = new Promise<void>((resolve) => {
				locked = resolve;
			});
			const holding = fixture.withConnectionLock(row.id, async () => {
				locked();
				await release;
			});
			await entered;
			const groupPath = `Queued/${row.id}`;
			const reconnecting = fixture.connection.saveGitlabConnection({
				organizationId: row.organizationId,
				userId: row.connectedByUserId,
				token: "RECONNECTED_PAT_FIXTURE_TOKEN",
				auth: "token",
				expiresAt,
				host: "gitlab.com",
				groupPath,
				externalAccountId: "9",
				externalAccountLabel: null,
				webhookSecret: "RECONNECTED_PAT_FIXTURE_HOOK",
			});
			async function waitFor(count: number) {
				for (let attempt = 0; attempt < 40; attempt++) {
					const [waiting] =
						await fixture.client`select count(*)::integer as count from pg_locks where locktype = 'advisory' and not granted`;
					if ((waiting?.count ?? 0) >= count) return;
					await new Promise((resolve) => setTimeout(resolve, 5));
				}
				throw new Error("Expected genuine advisory-lock waiter missing");
			}
			let exchanges = 0;
			let refreshing: ReturnType<typeof fixture.refresh.refreshGitlabToken>;
			try {
				await waitFor(1);
				refreshing = fixture.refresh.refreshGitlabToken(row.id, {
					organizationId: row.organizationId,
					credentials,
					send: async () => {
						exchanges++;
						throw new Error("Stale OAuth context used for PAT reconnect");
					},
				});
				await waitFor(2);
			} finally {
				unlock();
			}
			await holding;
			expect((await reconnecting).ok).toBe(true);
			expect(await refreshing).toEqual({
				disconnected: false,
				accessToken: "RECONNECTED_PAT_FIXTURE_TOKEN",
			});
			expect(exchanges).toBe(0);
			const current = await fixture.db.query.connections.findFirst({
				where: eq(connections.id, row.id),
			});
			expect(current?.disconnectedAt).toBeNull();
			expect(current?.state).toMatchObject({ auth: "token", groupPath });
		}
	});
	test("locked ownership and connector changes reject stale refresh before transport or token return", async () => {
		for (const tokenExpiresAt of [null, new Date(Date.now() + 7200_000)]) {
			await ready;
			const foreign = await fixture.identity();
			for (const changes of [
				{ organizationId: foreign.organizationId },
				{ connector: "github" },
				{ ownerKind: "user", externalUserId: "QUEUED_FIXTURE_USER" },
			]) {
				const row = await oauth();
				let unlock = () => {};
				const release = new Promise<void>((resolve) => {
					unlock = resolve;
				});
				let locked = () => {};
				const entered = new Promise<void>((resolve) => {
					locked = resolve;
				});
				const holding = fixture.withConnectionLock(row.id, async (tx) => {
					locked();
					await release;
					await tx
						.update(connections)
						.set({ ...changes, tokenExpiresAt })
						.where(eq(connections.id, row.id));
				});
				await entered;
				let exchanges = 0;
				const refreshing = fixture.refresh.refreshGitlabToken(row.id, {
					organizationId: row.organizationId,
					credentials,
					send: async () => {
						exchanges++;
						return Response.json({ error: "invalid_grant" }, { status: 400 });
					},
				});
				let waiting = 0;
				try {
					for (let attempt = 0; attempt < 40; attempt++) {
						const [lock] =
							await fixture.client`select count(*)::integer as count from pg_locks where locktype = 'advisory' and not granted`;
						waiting = lock?.count ?? 0;
						if (waiting) break;
						await new Promise((resolve) => setTimeout(resolve, 5));
					}
					expect(waiting).toBeGreaterThan(0);
				} finally {
					unlock();
				}
				await holding;
				expect(await refreshing).toEqual({ disconnected: true });
				expect(exchanges).toBe(0);
				const current = await fixture.db.query.connections.findFirst({
					where: eq(connections.id, row.id),
				});
				expect(current?.disconnectedAt).toBeNull();
			}
		}
	});
	test("reconnect waits for real refresh advisory lock and cannot be overwritten by a stale grant", async () => {
		const row = await oauth();
		const groupPath = `Refresh/${row.id}`;
		await fixture.db
			.update(connections)
			.set({
				state: {
					provider: "gitlab",
					host: "gitlab.com",
					groupPath,
					auth: "oauth",
					webhookSecret: "OLD_FIXTURE_HOOK",
				},
			})
			.where(eq(connections.id, row.id));
		let started = () => {};
		const entered = new Promise<void>((resolve) => {
			started = resolve;
		});
		let resume = (_response: Response) => {};
		const response = new Promise<Response>((resolve) => {
			resume = resolve;
		});
		const refreshing = fixture.refresh.refreshGitlabToken(row.id, {
			credentials,
			send: async () => {
				started();
				return response;
			},
		});
		await entered;
		let reconnectFinished = false;
		const reconnecting = fixture.connection
			.saveGitlabConnection({
				organizationId: row.organizationId,
				userId: row.connectedByUserId,
				token: "RECONNECTED_FIXTURE_TOKEN",
				refreshToken: "RECONNECTED_FIXTURE_GRANT",
				expiresAt: new Date(Date.now() + 7200_000),
				auth: "oauth",
				host: "gitlab.com",
				groupPath,
				externalAccountId: "9",
				externalAccountLabel: null,
				webhookSecret: "IGNORED_FIXTURE_HOOK",
			})
			.then((value) => {
				reconnectFinished = true;
				return value;
			});
		let waiters = 0;
		for (let attempt = 0; attempt < 30; attempt++) {
			const [waiting] =
				await fixture.client`select count(*)::integer as count from pg_locks where locktype = 'advisory' and not granted`;
			waiters = waiting?.count ?? 0;
			if (waiters) break;
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		try {
			expect(waiters).toBeGreaterThan(0);
			expect(reconnectFinished).toBe(false);
		} finally {
			resume(
				Response.json({
					access_token: "ROTATED_FIXTURE_TOKEN",
					refresh_token: "ROTATED_FIXTURE_GRANT",
					expires_in: 7200,
				}),
			);
		}
		await refreshing;
		expect((await reconnecting).ok).toBe(true);
		const current = await fixture.db.query.connections.findFirst({
			where: eq(connections.id, row.id),
		});
		expect(await fixture.crypto.decryptSecret(current?.accessToken ?? "")).toBe(
			"RECONNECTED_FIXTURE_TOKEN",
		);
		expect(
			await fixture.crypto.decryptSecret(current?.refreshToken ?? ""),
		).toBe("RECONNECTED_FIXTURE_GRANT");
	});
});
