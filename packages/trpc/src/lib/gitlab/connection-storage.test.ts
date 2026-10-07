import { afterAll, describe, expect, test } from "bun:test";
import { connections } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import type { SaveGitlabConnectionInput } from "./connection";
import {
	connectionFixture,
	fixtureUrl,
} from "./connection.fixture.integration";

describe.skipIf(!fixtureUrl)(
	"native GitLab organization connection persistence",
	() => {
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
		async function input(
			overrides: Partial<SaveGitlabConnectionInput> = {},
		): Promise<SaveGitlabConnectionInput> {
			await ready;
			return {
				...(await fixture.identity()),
				token: "SAVE_FIXTURE_TOKEN",
				auth: "token",
				host: "gitlab.com",
				groupPath: "Acme/Widget",
				scopeKind: "project",
				externalAccountId: "9",
				externalAccountLabel: "Acme",
				webhookSecret: "NEW_FIXTURE_HOOK",
				...overrides,
			};
		}
		test("concurrent organizations atomically claim one normalized host/kind/path account", async () => {
			const first = await input({ groupPath: "Claims/Widget" });
			const second = await input({
				groupPath: "Claims/Widget",
				host: "GITLAB.COM",
			});
			const claims = await Promise.all([
				fixture.connection.saveGitlabConnection(first),
				fixture.connection.saveGitlabConnection(second),
			]);
			expect(claims.filter((result) => result.ok)).toHaveLength(1);
			expect(claims.filter((result) => !result.ok)).toEqual([
				{ ok: false, reason: "already_connected" },
			]);
			for (const [organizationId, claim] of [
				[first.organizationId, claims[0]],
				[second.organizationId, claims[1]],
			] as const) {
				const row =
					await fixture.connection.gitlabConnectionForOrg(organizationId);
				expect(Boolean(row)).toBe(claim?.ok);
				if (row)
					expect(row.externalAccountId).toBe(
						"gitlab.com:project:Claims/Widget",
					);
			}
		});
		test("same-scope reconnect retains row and hook secret while changed scope rotates hook and encrypted pair", async () => {
			const initial = await input({
				groupPath: "Reconnect/Widget",
				auth: "oauth",
				refreshToken: "SAVE_FIXTURE_REFRESH",
				expiresAt: new Date(Date.now() + 7200_000),
			});
			const first = await fixture.connection.saveGitlabConnection(initial);
			if (!first.ok) throw new Error("Initial save failed");
			const same = await fixture.connection.saveGitlabConnection({
				...initial,
				host: "GITLAB.COM",
				token: "RECONNECTED_FIXTURE_TOKEN",
				refreshToken: "RECONNECTED_FIXTURE_REFRESH",
				webhookSecret: "DISCARDED_FIXTURE_HOOK",
			});
			expect(same).toEqual(first);
			const changed = await fixture.connection.saveGitlabConnection({
				...initial,
				groupPath: "Reconnect/Other",
				token: "CHANGED_FIXTURE_TOKEN",
				refreshToken: "CHANGED_FIXTURE_REFRESH",
				webhookSecret: "CHANGED_FIXTURE_HOOK",
			});
			expect(changed).toEqual({
				...first,
				webhookSecret: "CHANGED_FIXTURE_HOOK",
			});
			const row = await fixture.db.query.connections.findFirst({
				where: eq(connections.id, first.connectionId),
			});
			expect(row?.accessToken).not.toBe("CHANGED_FIXTURE_TOKEN");
			expect(row?.refreshToken).not.toBe("CHANGED_FIXTURE_REFRESH");
			expect(await fixture.crypto.decryptSecret(row?.accessToken ?? "")).toBe(
				"CHANGED_FIXTURE_TOKEN",
			);
			expect(await fixture.crypto.decryptSecret(row?.refreshToken ?? "")).toBe(
				"CHANGED_FIXTURE_REFRESH",
			);
			expect(row?.state).toMatchObject({
				groupPath: "Reconnect/Other",
				webhookSecret: "CHANGED_FIXTURE_HOOK",
			});
		});
		test("same namespace on different host ports remains independent and legacy same-scope claims are honored", async () => {
			const first = await input({
				host: "git.fixture.test:8443",
				groupPath: "Instances/Widget",
			});
			const second = await input({
				host: "git.fixture.test:9443",
				groupPath: "Instances/Widget",
			});
			expect((await fixture.connection.saveGitlabConnection(first)).ok).toBe(
				true,
			);
			expect((await fixture.connection.saveGitlabConnection(second)).ok).toBe(
				true,
			);
			await fixture.seed({
				externalAccountId: "LEGACY_FIXTURE_ACCOUNT",
				state: {
					provider: "gitlab",
					host: "gitlab.com",
					groupPath: "Legacy/Widget",
					auth: "token",
					webhookSecret: "LEGACY_FIXTURE_HOOK",
				},
			});
			expect(
				await fixture.connection.saveGitlabConnection(
					await input({
						groupPath: "Legacy/Widget",
						externalAccountId: "LEGACY_FIXTURE_ACCOUNT",
					}),
				),
			).toEqual({ ok: false, reason: "already_connected" });
		});
		test("credentials enforce organization ownership and exact requested host/port/project scope before API use", async () => {
			await ready;
			const row = await fixture.seed({
				state: {
					provider: "gitlab",
					host: "git.fixture.test:8443",
					groupPath: "Acme",
					scopeKind: "group",
					auth: "token",
					webhookSecret: "FIXTURE_HOOK",
				},
			});
			let requests = 0;
			const send = async () => {
				requests++;
				return Response.json({ id: 9 });
			};
			expect(
				await fixture.connection.gitlabCredentialsFor(row.id, {
					organizationId: "00000000-0000-0000-0000-000000000001",
					send,
				}),
			).toBeNull();
			for (const expected of [
				{ host: "git.fixture.test:9443", projectPath: "Acme/Widget" },
				{ host: "git.fixture.test:8443", projectPath: "Acme-other/Widget" },
			])
				expect(
					await fixture.connection.gitlabCredentialsFor(row.id, {
						organizationId: row.organizationId,
						expected,
						send,
					}),
				).toBeNull();
			const user = await fixture.seed({
				ownerKind: "user",
				externalUserId: "FIXTURE_USER",
			});
			expect(
				await fixture.connection.gitlabCredentialsFor(user.id, { send }),
			).toBeNull();
			expect(requests).toBe(0);
			const credentials = await fixture.connection.gitlabCredentialsFor(
				row.id,
				{
					organizationId: row.organizationId,
					expected: {
						host: "git.fixture.test:8443",
						projectPath: "Acme/Widget",
					},
					send,
				},
			);
			expect(credentials?.token).toBe("OLD_FIXTURE_TOKEN");
			expect(credentials?.connectionId).toBe(row.id);
			expect(credentials?.organizationId).toBe(row.organizationId);
			expect(requests).toBe(1);
		});
		test("valid legacy canonical host forms prevent another organization claiming the same scope", async () => {
			await ready;
			for (const host of ["gitlab.com:443", "https://gitlab.com"]) {
				const groupPath = `Canonical/${crypto.randomUUID()}`;
				await fixture.seed({
					externalAccountId: "9",
					state: {
						provider: "gitlab",
						host,
						groupPath,
						auth: "token",
						webhookSecret: "LEGACY_FIXTURE_HOOK",
					},
				});
				expect(
					await fixture.connection.saveGitlabConnection(
						await input({ groupPath }),
					),
				).toEqual({ ok: false, reason: "already_connected" });
			}
		});
		test("current 401 disconnects, transient user API failure propagates, and unreadable ciphertext is unavailable", async () => {
			await ready;
			const transient = await fixture.seed();
			await expect(
				fixture.connection.gitlabCredentialsFor(transient.id, {
					send: async () => Response.json({}, { status: 503 }),
				}),
			).rejects.toMatchObject({ status: 503 });
			expect(
				(
					await fixture.db.query.connections.findFirst({
						where: eq(connections.id, transient.id),
					})
				)?.disconnectedAt,
			).toBeNull();
			const revoked = await fixture.seed();
			expect(
				await fixture.connection.gitlabCredentialsFor(revoked.id, {
					send: async () => Response.json({}, { status: 401 }),
				}),
			).toBeNull();
			expect(
				await fixture.connection.gitlabConnectionForOrg(revoked.organizationId),
			).toBeUndefined();
			expect(
				await fixture.connection.gitlabConnectionForOrg(
					revoked.organizationId,
					{ includeDisconnected: true },
				),
			).toMatchObject({ disconnectReason: "needs_reauth" });
			const bad = await fixture.seed({
				accessToken: "v1:CORRUPT_FIXTURE_CIPHERTEXT",
			});
			expect(
				await fixture.connection.gitlabCredentialsFor(bad.id, {
					send: async () => {
						throw new Error("Unreadable token sent");
					},
				}),
			).toBeNull();
		});
		test("stale 401 and successful validation cannot disconnect or return a reconnected account", async () => {
			await ready;
			for (const status of [401, 200]) {
				const row = await fixture.seed();
				let started = () => {};
				const entered = new Promise<void>((resolve) => {
					started = resolve;
				});
				let resume = (_response: Response) => {};
				const response = new Promise<Response>((resolve) => {
					resume = resolve;
				});
				const loading = fixture.connection.gitlabCredentialsFor(row.id, {
					send: async (origin, token) => {
						expect(origin).toBe("https://gitlab.com");
						expect(token).toBe("OLD_FIXTURE_TOKEN");
						started();
						return response;
					},
				});
				await entered;
				const reconnected = await fixture.connection.saveGitlabConnection(
					await input({
						organizationId: row.organizationId,
						userId: row.connectedByUserId,
						host: "other.fixture.test:8443",
						groupPath: `Changed/${row.id}`,
						token: "OLD_FIXTURE_TOKEN",
					}),
				);
				expect(reconnected.ok).toBe(true);
				resume(Response.json({}, { status }));
				expect(await loading).toBeNull();
				const current = await fixture.db.query.connections.findFirst({
					where: eq(connections.id, row.id),
				});
				expect(current?.disconnectedAt).toBeNull();
				expect(current?.state).toMatchObject({
					host: "other.fixture.test:8443",
				});
			}
		});
	},
);
