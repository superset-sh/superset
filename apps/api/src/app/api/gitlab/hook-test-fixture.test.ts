import { expect, mock } from "bun:test";
import type { SelectConnection } from "@superset/db/schema";
import { type SQL, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

export const connectionId = "00000000-0000-4000-8000-000000000007";
export async function setupGitlabHookFixture() {
	const environment = {
		NODE_ENV: "production",
		NEXT_PUBLIC_API_URL: "https://api.example.invalid",
		NEXT_PUBLIC_WEB_URL: "https://web.example.invalid",
		GITLAB_WEBHOOK_ORIGIN: "",
		QSTASH_CURRENT_SIGNING_KEY: "fixture-current-signing-key",
		QSTASH_NEXT_SIGNING_KEY: "fixture-next-signing-key",
	};
	mock.module("@/env", () => ({ env: environment }));
	mock.module(
		new URL("../../../../../../packages/trpc/src/env.ts", import.meta.url)
			.pathname,
		() => ({ env: {} }),
	);
	mock.module("@superset/auth/env", () => ({
		env: { BETTER_AUTH_SECRET: "FIXTURE_ONLY_CRYPTO_SECRET" },
	}));
	process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
	const crypto = await import(
		"../../../../../../packages/trpc/src/router/plugins/crypto.ts"
	);
	mock.module("@superset/trpc/integrations/plugins", () => crypto);
	mock.module(
		new URL(
			"../../../../../../packages/trpc/src/lib/connectors/index.ts",
			import.meta.url,
		).pathname,
		() => crypto,
	);
	const fixture = {
		environment,
		crypto,
		current: null as SelectConnection | null,
		additionalRows: [] as SelectConnection[],
		role: "admin" as string | null,
		lockDepth: 0,
		reads: 0,
		selections: 0,
		where: undefined as SQL | undefined,
		calls: [] as Array<{ url: URL; init: RequestInit }>,
		interceptor: undefined as
			| ((url: URL, init: RequestInit) => Promise<Response | null>)
			| undefined,
	};
	function transaction(id: string) {
		const select = {
			from: () => select,
			where: () => select,
			limit: async () => {
				const row =
					fixture.current?.id === id
						? fixture.current
						: fixture.additionalRows.find((row) => row.id === id);
				return row ? [structuredClone(row)] : [];
			},
		};
		return {
			select: () => select,
			update: () => ({
				set: (values: Partial<SelectConnection>) => ({
					where: async () => {
						if (fixture.current)
							fixture.current = { ...fixture.current, ...values };
					},
				}),
			}),
		};
	}
	let tail = Promise.resolve();
	async function locked<T>(
		_id: string,
		action: (tx: ReturnType<typeof transaction>) => Promise<T>,
	): Promise<T> {
		const previous = tail;
		let release = () => {};
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		fixture.lockDepth++;
		try {
			return await action(transaction(_id));
		} finally {
			fixture.lockDepth--;
			release();
		}
	}
	mock.module("@superset/db/utils", () => ({
		withConnectionLock: locked,
		findOrgMembership: async () =>
			fixture.role ? { role: fixture.role } : null,
	}));
	mock.module("@superset/auth/server", () => ({
		auth: {
			api: {
				getSession: async ({ headers }: { headers: Headers }) =>
					headers.get("authorization") === "Bearer VALID_FIXTURE_BEARER" ||
					headers.get("cookie") === "SESSION=VALID_FIXTURE_COOKIE"
						? { user: { id: "user_1" } }
						: null,
			},
		},
	}));
	const chain = {
		from: () => chain,
		where: (where: SQL) => {
			fixture.where = where;
			return Promise.resolve(
				[
					...(fixture.current ? [fixture.current] : []),
					...fixture.additionalRows,
				].map((row) => ({ id: row.id, organizationId: row.organizationId })),
			);
		},
	};
	mock.module("@superset/db/client", () => ({
		db: {
			query: {
				connections: {
					findFirst: async ({ where }: { where: SQL }) => {
						expect(fixture.lockDepth).toBe(0);
						fixture.reads++;
						const query = new PgDialect().sqlToQuery(where);
						const row = [
							...(fixture.current ? [fixture.current] : []),
							...fixture.additionalRows,
						].find(
							(row) =>
								row.connector === "gitlab" &&
								row.ownerKind === "org" &&
								!(
									query.sql.includes('"disconnected_at" is null') &&
									row.disconnectedAt
								) &&
								query.params.every(
									(parameter) =>
										typeof parameter !== "string" ||
										((!parameter.startsWith("organization_") ||
											parameter === row.organizationId) &&
											(!/^[0-9a-f-]{36}$/.test(parameter) ||
												parameter === row.id)),
								),
						);
						return row ? structuredClone(row) : undefined;
					},
				},
			},
			select: () => {
				expect(fixture.lockDepth).toBe(0);
				fixture.selections++;
				return chain;
			},
		},
	}));
	mock.module("@superset/trpc/sync-policy", () => ({
		organizationSyncs: () => {
			return sql`eligible_sync_policy`;
		},
	}));
	mock.module("@superset/trpc/lib/gitlab/transport", () => ({
		safeGitLabFetch: async (input: string | URL, init: RequestInit = {}) => {
			const url = new URL(input);
			fixture.calls.push({ url, init });
			const intercepted = await fixture.interceptor?.(url, init);
			if (intercepted) return intercepted;
			if (url.pathname === "/api/v4/user") {
				expect(fixture.lockDepth).toBe(0);
				return Response.json({ id: 12, username: "actor" });
			}
			if (url.pathname === "/api/v4/projects/7")
				return Response.json({ id: 7, path_with_namespace: "team/project" });
			if (url.pathname === "/api/v4/groups/99/projects")
				return Response.json([{ id: 7, path_with_namespace: "team/project" }], {
					headers: { "x-next-page": "" },
				});
			if (/\/hooks$/.test(url.pathname) && !init.method) {
				expect(fixture.lockDepth).toBe(1);
				return Response.json([], { headers: { "x-next-page": "" } });
			}
			if (["POST", "PUT", "DELETE"].includes(init.method ?? "")) {
				expect(fixture.lockDepth).toBe(1);
				return Response.json({ id: 17 });
			}
			throw new Error(`Unconfigured fake provider path ${url.pathname}`);
		},
	}));
	async function reset() {
		fixture.additionalRows = [];
		fixture.role = "admin";
		fixture.reads = 0;
		fixture.selections = 0;
		fixture.calls = [];
		fixture.interceptor = undefined;
		fixture.environment.GITLAB_WEBHOOK_ORIGIN = "";
		delete process.env.SELF_HOST_QUEUE;
		delete process.env.SELF_HOST_QUEUE_SECRET;
		fixture.current = {
			id: connectionId,
			organizationId: "organization_1",
			connectedByUserId: "user_1",
			connector: "gitlab",
			ownerKind: "org",
			authMethod: "token",
			accessToken: await crypto.encryptSecret("FIXTURE_PAT_TOKEN"),
			refreshToken: null,
			tokenExpiresAt: null,
			scopes: ["api"],
			issuer: null,
			resource: null,
			externalAccountId: "git.example.invalid:8443:project:team/project",
			externalAccountLabel: "team/project",
			externalUserId: null,
			externalUserLabel: null,
			config: null,
			state: {
				provider: "gitlab",
				host: "git.example.invalid:8443",
				groupPath: "team/project",
				scopeKind: "project",
				scopeId: "7",
				auth: "token",
				webhookSecret: "FIXTURE_HOOK_SECRET",
			},
			disconnectedAt: null,
			disconnectReason: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	}
	return { reset, fixture };
}

export function isolatedGitlabHookTests(file: string, mode: string) {
	const result = Bun.spawnSync(
		[process.execPath, "test", "--no-env-file", file],
		{
			cwd: new URL("../../../../", import.meta.url).pathname,
			env: {
				PATH: process.env.PATH ?? "",
				TMPDIR: "/tmp",
				SUPERSET_GITLAB_HOOK_FIXTURE: mode,
			},
			stdout: "pipe",
			stderr: "pipe",
			timeout: 20_000,
		},
	);
	expect(
		result.exitCode,
		result.stdout.toString() + result.stderr.toString(),
	).toBe(0);
}
