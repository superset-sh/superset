import { beforeEach, expect, mock, test } from "bun:test";
import type { SelectConnection } from "@superset/db/schema";
import type { SaveGitlabConnectionInput } from "@superset/trpc/lib/gitlab/connection";

if (process.env.SUPERSET_GITLAB_LIFECYCLE_FIXTURE === "1") {
	const environment = {
		BETTER_AUTH_SECRET: "FIXTURE_ONLY_STATE_SECRET",
		NEXT_PUBLIC_API_URL: "https://api.example.invalid",
		NEXT_PUBLIC_WEB_URL: "https://web.example.invalid",
		GITLAB_OAUTH_CLIENT_ID: "FIXTURE_CLIENT_ID",
		GITLAB_OAUTH_CLIENT_SECRET: "FIXTURE_CLIENT_SECRET",
		GITLAB_ISSUER: "https://git.example.invalid:8443",
		GITLAB_WEBHOOK_ORIGIN: "",
	};
	mock.module("@/env", () => ({ env: environment }));
	mock.module("@superset/auth/env", () => ({
		env: { BETTER_AUTH_SECRET: "FIXTURE_ONLY_CRYPTO_SECRET" },
	}));
	process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
	const crypto = await import(
		"../../../../../../packages/trpc/src/router/plugins/crypto.ts"
	);
	mock.module("@superset/trpc/integrations/plugins", () => crypto);
	mock.module("node:dns/promises", () => ({
		lookup: async () => [{ address: "1.1.1.1", family: 4 }],
	}));
	let role: string | null = "admin";
	let current: SelectConnection | null = null;
	let lockDepth = 0;
	let lockWaiters = 0;
	let tail = Promise.resolve();
	let conflict = false;
	let saved: SaveGitlabConnectionInput[] = [];
	let calls: Array<{ url: URL; init: RequestInit }> = [];
	let interceptor:
		| ((url: URL, init: RequestInit) => Promise<Response | null>)
		| undefined;
	function tx() {
		const select = {
			from: () => select,
			where: () => select,
			limit: async () => (current ? [{ ...current }] : []),
		};
		const update = {
			set: (values: Partial<SelectConnection>) => ({
				where: async () => {
					if (current) current = { ...current, ...values };
				},
			}),
		};
		return { select: () => select, update: () => update };
	}
	async function locked<T>(
		_id: string,
		action: (transaction: ReturnType<typeof tx>) => Promise<T>,
	): Promise<T> {
		const previous = tail;
		let release = () => {};
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		lockWaiters++;
		await previous;
		lockWaiters--;
		lockDepth++;
		try {
			return await action(tx());
		} finally {
			lockDepth--;
			release();
		}
	}
	mock.module("@superset/db/utils", () => ({
		withConnectionLock: locked,
		findOrgMembership: async () => (role ? { role } : null),
	}));
	mock.module("@superset/auth/server", () => ({
		auth: {
			api: {
				getSession: async ({ headers }: { headers: Headers }) =>
					headers.get("authorization") === "Bearer VALID_FIXTURE_BEARER" ||
					headers.get("cookie")?.includes("SESSION=VALID_FIXTURE_COOKIE")
						? { user: { id: "user_1" } }
						: null,
			},
		},
	}));
	async function persist(input: SaveGitlabConnectionInput) {
		const previous =
			current?.state?.provider === "gitlab" ? current.state : null;
		const webhookSecret =
			previous?.host === input.host &&
			previous.groupPath === input.groupPath &&
			(previous.scopeKind ?? "project") === (input.scopeKind ?? "project")
				? previous.webhookSecret
				: input.webhookSecret;
		const state = {
			provider: "gitlab" as const,
			host: input.host,
			groupPath: input.groupPath,
			scopeKind: input.scopeKind,
			scopeId: input.scopeId,
			auth: input.auth,
			webhookSecret,
		};
		current = {
			id: "connection_1",
			organizationId: input.organizationId,
			connectedByUserId: input.userId,
			connector: "gitlab",
			ownerKind: "org",
			authMethod: input.auth === "oauth" ? "oauth2" : "token",
			accessToken: await crypto.encryptSecret(input.token),
			refreshToken: await crypto.encryptOptional(input.refreshToken),
			tokenExpiresAt: input.expiresAt ?? null,
			scopes: ["api", "read_repository"],
			issuer: null,
			resource: null,
			externalAccountId: input.externalAccountId,
			externalAccountLabel: input.externalAccountLabel,
			externalUserId: null,
			externalUserLabel: null,
			config: null,
			state,
			disconnectedAt: null,
			disconnectReason: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		return {
			ok: true as const,
			connectionId: current.id,
			webhookSecret,
		};
	}
	mock.module("@superset/trpc/lib/gitlab/connection", () => ({
		gitlabCredentialsFor: async () => null,
		saveGitlabConnection: async (input: SaveGitlabConnectionInput) => {
			saved.push(input);
			if (conflict) return { ok: false, reason: "already_connected" };
			return locked("connection_1", () => persist(input));
		},
		gitlabConnectionForOrg: async (organizationId: string) =>
			current?.organizationId === organizationId &&
			current.connector === "gitlab" &&
			current.ownerKind === "org"
				? { ...current }
				: undefined,
	}));
	mock.module("@superset/trpc/lib/gitlab/transport", () => ({
		safeGitLabFetch: async (input: string | URL, init: RequestInit = {}) => {
			const url = new URL(input);
			calls.push({ url, init });
			const intercepted = await interceptor?.(url, init);
			if (intercepted) return intercepted;
			if (url.pathname === "/oauth/token")
				return Response.json({
					access_token: "OAUTH_FIXTURE_TOKEN",
					refresh_token: "OAUTH_FIXTURE_GRANT",
					expires_in: 7200,
				});
			if (url.pathname === "/oauth/revoke") {
				expect(lockDepth).toBe(1);
				return new Response(null, { status: 200 });
			}
			if (url.pathname === "/api/v4/user")
				return Response.json({ id: 17, username: "tester" });
			if (url.pathname === "/api/v4/projects/team%2Fsub")
				return new Response(null, { status: 404 });
			if (url.pathname === "/api/v4/groups/team%2Fsub")
				return Response.json({ id: 31, full_path: "team/sub" });
			if (
				url.pathname === "/api/v4/projects/team%2Fsub%2Fwidget" ||
				url.pathname === "/api/v4/projects/29"
			)
				return Response.json({
					id: 29,
					path_with_namespace: "team/sub/widget",
				});
			if (url.pathname === "/api/v4/groups/31/projects") {
				expect(lockDepth).toBe(0);
				return Response.json(
					[
						{ id: 29, path_with_namespace: "team/sub/widget" },
						{ id: 32, path_with_namespace: "team/sub/deep/widget" },
						{ id: 99, path_with_namespace: "other/widget" },
					],
					{ headers: { "x-next-page": "" } },
				);
			}
			if (/\/hooks(?:\/\d+)?$/.test(url.pathname)) {
				if (!init.method) {
					expect(lockDepth).toBeGreaterThanOrEqual(0);
					return Response.json(
						[
							{
								id: 53,
								url: "https://api.example.invalid/api/gitlab/webhook?connection=connection_1",
							},
							{ id: 54, url: "https://foreign.invalid/hook" },
						],
						{ headers: { "x-next-page": "" } },
					);
				}
				expect(lockDepth).toBe(1);
				return init.method === "DELETE"
					? new Response(null, { status: 204 })
					: Response.json({ id: 53 });
			}
			throw new Error(`Unconfigured fake provider path ${url.pathname}`);
		},
	}));
	const connect = await import("./connect/route");
	const callback = await import("./callback/route");
	const disconnect = await import("./disconnect/route");
	const { completeGitlabConnection } = await import("./lifecycle");
	function request(
		path: string,
		opts: {
			body?: URLSearchParams;
			origin?: string | null;
			authorization?: string;
			cookie?: string;
		} = {},
	) {
		const headers = new Headers({
			cookie: opts.cookie ?? "SESSION=VALID_FIXTURE_COOKIE",
		});
		if (opts.origin !== null)
			headers.set("origin", opts.origin ?? environment.NEXT_PUBLIC_WEB_URL);
		if (opts.authorization) headers.set("authorization", opts.authorization);
		return new Request(
			`${environment.NEXT_PUBLIC_API_URL}/api/gitlab/${path}`,
			{ method: opts.body ? "POST" : "GET", headers, body: opts.body },
		);
	}
	function form(groupPath = "team/sub/widget") {
		return new URLSearchParams({
			host: "git.example.invalid:8443",
			token: "PAT_FIXTURE_TOKEN",
			groupPath,
		});
	}
	function oauthForm(
		groupPath = "team/sub/widget",
		host = "git.example.invalid:8443",
	) {
		return new URLSearchParams({ mode: "oauth", host, groupPath });
	}
	function location(response: Response) {
		return new URL(response.headers.get("location") ?? "");
	}
	async function oauthCallback(roleAtCallback = "admin") {
		role = "admin";
		const started = await connect.POST(
			request("connect?organizationId=org_1", { body: oauthForm() }),
		);
		const authorize = location(started);
		const state = authorize.searchParams.get("state") ?? "";
		role = roleAtCallback;
		return callback.GET(
			request(
				`callback?code=FIXTURE_CODE&state=${encodeURIComponent(state)}&organizationId=forged_callback_org`,
				{
					cookie: `gitlab_oauth_state=${state}`,
				},
			),
		);
	}
	beforeEach(() => {
		environment.GITLAB_WEBHOOK_ORIGIN = "";
		role = "admin";
		current = null;
		saved = [];
		calls = [];
		conflict = false;
		interceptor = undefined;
	});
	test("successful and rejected PAT forms return to the verified query organization", async () => {
		const body = form();
		body.set("organizationId", "forged_body_org");
		const accepted = location(
			await connect.POST(
				request("connect?organizationId=org_1&returnTo=https://evil.invalid", {
					body,
				}),
			),
		);
		expect(accepted.searchParams.get("organizationId")).toBe("org_1");
		expect(accepted.origin).toBe(environment.NEXT_PUBLIC_WEB_URL);
		expect(saved[0]?.organizationId).toBe("org_1");
		const rejected = location(
			await connect.POST(
				request("connect?organizationId=org_1", {
					body: new URLSearchParams({ token: "", groupPath: "team/sub" }),
				}),
			),
		);
		expect(rejected.searchParams.get("organizationId")).toBe("org_1");
		expect(rejected.searchParams.get("error")).toBe("token_rejected");
	});
	test("GET never mints OAuth state or contacts the provider", async () => {
		const response = await connect.GET(
			request(
				"connect?mode=oauth&organizationId=org_1&host=gitlab.com&groupPath=team/sub/widget",
			),
		);
		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("POST");
		expect(response.headers.get("set-cookie")).toBeNull();
		expect(calls).toHaveLength(0);
		expect(saved).toHaveLength(0);
	});
	test("OAuth initiation refuses cross-site and unverified form submissions before minting state", async () => {
		for (const origin of ["https://attacker.invalid", null]) {
			const response = await connect.POST(
				request("connect?organizationId=org_1", { body: oauthForm(), origin }),
			);
			expect(response.status).toBe(403);
			expect(response.headers.get("set-cookie")).toBeNull();
		}
		for (const denied of ["member", null]) {
			role = denied;
			const response = await connect.POST(
				request("connect?organizationId=org_1", { body: oauthForm() }),
			);
			expect(location(response).searchParams.get("error")).toBe("sign_in");
			expect(response.headers.get("set-cookie")).toBeNull();
		}
		expect(calls).toHaveLength(0);
		expect(saved).toHaveLength(0);
	});
	test("OAuth setup errors return only to an already verified organization", async () => {
		const path = "connect?organizationId=org_1";
		const missing = location(
			await connect.POST(request(path, { body: oauthForm("") })),
		);
		expect(missing.searchParams.get("organizationId")).toBe("org_1");
		expect(missing.searchParams.get("error")).toBe("path_not_found");
		const secret = environment.GITLAB_OAUTH_CLIENT_SECRET;
		try {
			environment.GITLAB_OAUTH_CLIENT_SECRET = "";
			const response = location(
				await connect.POST(request(path, { body: oauthForm("") })),
			);
			expect(response.searchParams.get("organizationId")).toBe("org_1");
			expect(response.searchParams.get("error")).toBe("oauth_not_configured");
		} finally {
			environment.GITLAB_OAUTH_CLIENT_SECRET = secret;
		}
		role = "member";
		for (const response of [
			await connect.POST(request(path, { body: oauthForm() })),
			await connect.POST(
				request("connect?organizationId=forged_query_org", { body: form() }),
			),
		])
			expect(location(response).searchParams.has("organizationId")).toBe(false);
	});
	test("OAuth callback success and provider failure retain signed-state org, never callback query authority", async () => {
		const response = location(await oauthCallback());
		expect(response.searchParams.get("organizationId")).toBe("org_1");
		interceptor = async (url) =>
			url.pathname === "/oauth/token"
				? new Response(null, { status: 401 })
				: null;
		const failed = location(await oauthCallback());
		expect(failed.searchParams.get("organizationId")).toBe("org_1");
		expect(failed.searchParams.get("error")).toBe("token_rejected");
		const denied = location(await oauthCallback("member"));
		expect(denied.searchParams.has("organizationId")).toBe(false);
		const invalid = location(
			await callback.GET(
				request(
					"callback?code=FAKE&state=other&organizationId=forged_query_org",
					{ cookie: "gitlab_oauth_state=unrelated" },
				),
			),
		);
		expect(invalid.searchParams.has("organizationId")).toBe(false);
		expect(invalid.searchParams.get("error")).toBe("invalid_state");
	});
	test("disconnect retains verified organization in its local outcome", async () => {
		await connect.POST(
			request("connect?organizationId=org_1", { body: form() }),
		);
		const response = location(
			await disconnect.POST(
				request("disconnect?organizationId=org_1", {
					body: new URLSearchParams({ organizationId: "forged_body_org" }),
				}),
			),
		);
		expect(response.searchParams.get("organizationId")).toBe("org_1");
		expect(response.searchParams.get("disconnected")).toBe("1");
	});
	test("PAT routes require admin and trusted browser or actual bearer authorization", async () => {
		role = "member";
		expect(
			location(
				await connect.POST(
					request("connect?organizationId=org_1", { body: form() }),
				),
			).searchParams.get("error"),
		).toBe("sign_in");
		expect(calls).toHaveLength(0);
		role = "owner";
		expect(
			(
				await connect.POST(
					request("connect?organizationId=org_1", {
						body: form(),
						origin: "https://evil.invalid",
					}),
				)
			).status,
		).toBe(403);
		expect(
			location(
				await connect.POST(
					request("connect?organizationId=org_1", {
						body: form(),
						origin: null,
						authorization: "Bearer FORGED",
					}),
				),
			).searchParams.get("error"),
		).toBe("sign_in");
		expect(calls).toHaveLength(0);
		const accepted = await connect.POST(
			request("connect?organizationId=org_1", {
				body: form(),
				origin: null,
				authorization: "Bearer VALID_FIXTURE_BEARER",
				cookie: "",
			}),
		);
		expect(location(accepted).searchParams.get("connected")).toBe("1");
		expect(saved[0]).toMatchObject({
			organizationId: "org_1",
			host: "git.example.invalid:8443",
			scopeKind: "project",
			scopeId: "29",
			auth: "token",
		});
		expect(current?.accessToken).not.toContain("PAT_FIXTURE_TOKEN");
	});
	test("group PAT registers only namespace projects with original event flags and fixed webhook return URLs", async () => {
		const response = await connect.POST(
			request("connect?organizationId=org_1&returnTo=https://evil.invalid", {
				body: form("team/sub"),
			}),
		);
		expect(location(response).origin).toBe(environment.NEXT_PUBLIC_WEB_URL);
		expect(saved[0]).toMatchObject({ scopeKind: "group", scopeId: "31" });
		const mutations = calls.filter(
			({ init }) => init.method === "PUT" || init.method === "POST",
		);
		expect(mutations.map(({ url }) => url.pathname)).toEqual([
			"/api/v4/projects/29/hooks/53",
			"/api/v4/projects/32/hooks/53",
		]);
		for (const { init } of mutations)
			expect(JSON.parse(String(init.body))).toMatchObject({
				token:
					current?.state?.provider === "gitlab"
						? current.state.webhookSecret
						: "",
				issues_events: true,
				push_events: true,
				pipeline_events: true,
				note_events: true,
				merge_requests_events: true,
				enable_ssl_verification: true,
			});
	});
	test("routes register the saved stable secret on same-scope reconnect and a new secret on changed scope", async () => {
		await connect.POST(
			request("connect?organizationId=org_1", { body: form() }),
		);
		const previous = current?.state;
		if (previous?.provider !== "gitlab")
			throw new Error("Fixture scope missing");
		calls = [];
		await connect.POST(
			request("connect?organizationId=org_1", { body: form() }),
		);
		const same = calls.find(({ init }) => init.method === "PUT");
		expect(JSON.parse(String(same?.init.body)).token).toBe(
			previous.webhookSecret,
		);
		calls = [];
		await connect.POST(
			request("connect?organizationId=org_1", { body: form("team/sub") }),
		);
		const changed = calls.find(({ init }) => init.method === "PUT");
		expect(JSON.parse(String(changed?.init.body)).token).not.toBe(
			previous.webhookSecret,
		);
	});
	test("conflict and hook failure preserve original external outcomes", async () => {
		conflict = true;
		expect(
			location(
				await connect.POST(
					request("connect?organizationId=org_1", { body: form() }),
				),
			).searchParams.get("error"),
		).toBe("already_connected");
		conflict = false;
		interceptor = async (_url, init) =>
			init.method === "PUT" ? new Response(null, { status: 403 }) : null;
		const failed = location(
			await connect.POST(
				request("connect?organizationId=org_1", { body: form() }),
			),
		);
		expect(failed.searchParams.get("error")).toBe("hook_failed");
		expect(failed.searchParams.get("connected")).toBe("1");
		expect(current?.disconnectedAt).toBeNull();
	});
	test("OAuth uses exact issuer, upstream bound PKCE state and callback admin recheck", async () => {
		const accepted = await oauthCallback("owner");
		expect(accepted.status).toBe(303);
		expect(location(accepted).searchParams.get("connected")).toBe("1");
		expect(accepted.headers.get("set-cookie")).toContain("Max-Age=0");
		const exchange = calls.find(({ url }) => url.pathname === "/oauth/token");
		expect(exchange?.url.origin).toBe(environment.GITLAB_ISSUER);
		expect(String(exchange?.init.body)).toContain("code_verifier=");
		expect(saved[0]).toMatchObject({
			auth: "oauth",
			refreshToken: "OAUTH_FIXTURE_GRANT",
		});
		calls = [];
		expect(
			location(await oauthCallback("member")).searchParams.get("error"),
		).toBe("unauthorized");
		expect(calls).toHaveLength(0);
		role = "admin";
		expect(
			location(
				await connect.POST(
					request("connect?organizationId=org_1", {
						body: oauthForm("team/sub/widget", "gitlab.com"),
					}),
				),
			).searchParams.get("error"),
		).toBe("host_not_allowed");
	});
	test("callback failures clear the upstream state cookie, keep legacy redirect status and never leak provider bodies", async () => {
		interceptor = async (url) =>
			url.pathname === "/oauth/token"
				? new Response("FAKE_PRIVATE_PROVIDER_BODY", { status: 401 })
				: null;
		const rejected = await oauthCallback();
		expect(rejected.status).toBe(303);
		expect(location(rejected).searchParams.get("error")).toBe("token_rejected");
		expect(rejected.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(rejected.headers.get("location")).not.toContain(
			"FAKE_PRIVATE_PROVIDER_BODY",
		);
		calls = [];
		const invalid = await callback.GET(
			request("callback?code=FAKE_CODE&state=other-browser", {
				cookie: "gitlab_oauth_state=fixture-state",
			}),
		);
		expect(invalid.status).toBe(303);
		expect(location(invalid).searchParams.get("error")).toBe("invalid_state");
		expect(invalid.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(calls).toHaveLength(0);
	});
	test("callback separates retryable upstream failure from token rejection without saving", async () => {
		for (const status of [401, 503]) {
			interceptor = async (url) =>
				url.pathname === "/oauth/token"
					? new Response("FAKE_PRIVATE_PROVIDER_BODY", { status })
					: null;
			const response = await oauthCallback();
			expect(location(response).searchParams.get("error")).toBe(
				status === 401 ? "token_rejected" : "provider_unavailable",
			);
			expect(current).toBeNull();
		}
		interceptor = async (url) =>
			url.pathname === "/oauth/token" ? Response.json({ not: "tokens" }) : null;
		expect(location(await oauthCallback()).searchParams.get("error")).toBe(
			"provider_unavailable",
		);
		expect(current).toBeNull();
	});
	test("disconnect clears locally, cleans only exact hook URL and revokes the captured OAuth grant", async () => {
		await oauthCallback();
		calls = [];
		const response = await disconnect.POST(
			request("disconnect?organizationId=org_1", {
				body: new URLSearchParams(),
			}),
		);
		expect(location(response).searchParams.get("disconnected")).toBe("1");
		expect(current?.disconnectedAt).toBeInstanceOf(Date);
		expect(await crypto.decryptSecret(current?.accessToken ?? "")).toBe("");
		expect(current?.refreshToken).toBeNull();
		expect(
			calls
				.filter(({ init }) => init.method === "DELETE")
				.map(({ url }) => url.pathname),
		).toEqual(["/api/v4/projects/29/hooks/53"]);
		expect(
			calls.filter(({ url }) => url.pathname === "/oauth/revoke"),
		).toHaveLength(1);
	});
	test("disconnect failure still clears locally and admin/origin checks precede cleanup", async () => {
		await connect.POST(
			request("connect?organizationId=org_1", { body: form() }),
		);
		calls = [];
		role = "member";
		const denied = await disconnect.POST(
			request("disconnect?organizationId=org_1", {
				body: new URLSearchParams(),
			}),
		);
		expect(denied.status).toBe(303);
		expect(location(denied).searchParams.get("error")).toBe("sign_in");
		expect(location(denied).searchParams.has("organizationId")).toBe(false);
		expect(calls).toHaveLength(0);
		role = "admin";
		expect(
			(
				await disconnect.POST(
					request("disconnect?organizationId=org_1", {
						body: new URLSearchParams(),
						origin: null,
						authorization: "Bearer FORGED",
					}),
				)
			).status,
		).toBe(303);
		expect(calls).toHaveLength(0);
		interceptor = async (_url, init) =>
			init.method === "DELETE" ? new Response(null, { status: 503 }) : null;
		const result = location(
			await disconnect.POST(
				request("disconnect?organizationId=org_1", {
					body: new URLSearchParams(),
				}),
			),
		);
		expect(result.searchParams.get("error")).toBe("disconnect_failed");
		expect(result.searchParams.get("disconnected")).toBe("1");
		expect(current?.disconnectedAt).toBeInstanceOf(Date);
	});
	test("a reconnect ahead of the initial disconnect lock is neither cleared nor revoked", async () => {
		await oauthCallback();
		calls = [];
		let unlock = () => {};
		const release = new Promise<void>((resolve) => {
			unlock = resolve;
		});
		let signal = () => {};
		const entered = new Promise<void>((resolve) => {
			signal = resolve;
		});
		const reconnecting = locked("connection_1", async () => {
			signal();
			await release;
			return persist({
				organizationId: "org_1",
				userId: "user_1",
				token: "NEW_QUEUED_FIXTURE_TOKEN",
				refreshToken: "NEW_QUEUED_FIXTURE_GRANT",
				auth: "oauth",
				host: "git.example.invalid:8443",
				groupPath: "team/sub/widget",
				scopeKind: "project",
				scopeId: "29",
				externalAccountId: "team/sub/widget",
				externalAccountLabel: null,
				webhookSecret: "NEW_QUEUED_FIXTURE_SECRET",
			});
		});
		await entered;
		const disconnecting = disconnect.POST(
			request("disconnect?organizationId=org_1", {
				body: new URLSearchParams(),
			}),
		);
		try {
			for (let attempt = 0; attempt < 20 && lockWaiters === 0; attempt++)
				await new Promise((resolve) => setTimeout(resolve, 0));
			expect(lockWaiters).toBe(1);
		} finally {
			unlock();
		}
		await reconnecting;
		await disconnecting;
		expect(current?.disconnectedAt).toBeNull();
		expect(await crypto.decryptSecret(current?.accessToken ?? "")).toBe(
			"NEW_QUEUED_FIXTURE_TOKEN",
		);
		expect(calls).toHaveLength(0);
	});
	test("reconnect during hook pagination prevents stale registration, cleanup and revocation", async () => {
		await oauthCallback();
		const previous = current;
		if (!previous) throw new Error("Fixture not connected");
		calls = [];
		interceptor = async (url, init) => {
			if (url.pathname.endsWith("/hooks") && !init.method) {
				interceptor = undefined;
				await locked(previous.id, () =>
					persist({
						organizationId: "org_1",
						userId: "user_1",
						host: "git.example.invalid:8443",
						token: "RECONNECTED_FIXTURE_TOKEN",
						auth: "oauth",
						groupPath: "team/sub/widget",
						scopeKind: "project",
						scopeId: "29",
						refreshToken: "NEW_FIXTURE_GRANT",
						externalAccountId: "team/sub/widget",
						externalAccountLabel: null,
						webhookSecret: "RECONNECTED_FIXTURE_SECRET",
					}),
				);
			}
			return null;
		};
		await disconnect.POST(
			request("disconnect?organizationId=org_1", {
				body: new URLSearchParams(),
			}),
		);
		expect(calls.filter(({ init }) => init.method === "DELETE")).toHaveLength(
			0,
		);
		expect(
			calls.filter(({ url }) => url.pathname === "/oauth/revoke"),
		).toHaveLength(0);
		expect(current?.disconnectedAt).toBeNull();
		expect(await crypto.decryptSecret(current?.accessToken ?? "")).toBe(
			"RECONNECTED_FIXTURE_TOKEN",
		);
		calls = [];
		interceptor = async (url, init) => {
			if (url.pathname.endsWith("/hooks") && !init.method && current) {
				interceptor = undefined;
				current = {
					...current,
					accessToken: await crypto.encryptSecret("CHANGED_FIXTURE_TOKEN"),
				};
			}
			return null;
		};
		const stale = location(
			await connect.POST(
				request("connect?organizationId=org_1", { body: form() }),
			),
		);
		expect(stale.searchParams.get("error")).toBe("hook_failed");
		expect(
			calls.filter(
				({ init }) => init.method === "PUT" || init.method === "POST",
			),
		).toHaveLength(0);
	});
	test("generation mutations without changing plaintext deny stale hook updates", async () => {
		for (const changed of [
			"organization",
			"provider",
			"owner",
			"config",
			"ciphertext",
		]) {
			calls = [];
			interceptor = async (url, init) => {
				if (url.pathname.endsWith("/hooks") && !init.method && current) {
					interceptor = undefined;
					if (changed === "organization")
						current = { ...current, organizationId: "other_org" };
					if (changed === "provider")
						current = { ...current, connector: "github" };
					if (changed === "owner") current = { ...current, ownerKind: "user" };
					if (changed === "config" && current.state?.provider === "gitlab")
						current = {
							...current,
							state: {
								...current.state,
								webhookSecret: "OTHER_FIXTURE_SECRET",
							},
						};
					if (changed === "ciphertext")
						current = {
							...current,
							accessToken: await crypto.encryptSecret("PAT_FIXTURE_TOKEN"),
						};
				}
				return null;
			};
			const response = await connect.POST(
				request("connect?organizationId=org_1", { body: form() }),
			);
			expect(location(response).searchParams.get("error")).toBe("hook_failed");
			expect(
				calls.filter(
					({ init }) => init.method === "POST" || init.method === "PUT",
				),
			).toHaveLength(0);
		}
	});
	test("invalid exact-hook and group project IDs report incomplete cleanup without using provider-controlled paths", async () => {
		for (const invalid of ["hook", "project"]) {
			await connect.POST(
				request("connect?organizationId=org_1", { body: form("team/sub") }),
			);
			calls = [];
			interceptor = async (url, init) => {
				if (invalid === "project" && url.pathname.endsWith("/projects"))
					return Response.json(
						[{ id: "../other", path_with_namespace: "team/sub/widget" }],
						{ headers: { "x-next-page": "" } },
					);
				if (
					invalid === "hook" &&
					url.pathname.endsWith("/hooks") &&
					!init.method
				)
					return Response.json(
						[
							{
								id: "../other",
								url: "https://api.example.invalid/api/gitlab/webhook?connection=connection_1",
							},
						],
						{ headers: { "x-next-page": "" } },
					);
				return null;
			};
			const response = await disconnect.POST(
				request("disconnect?organizationId=org_1", {
					body: new URLSearchParams(),
				}),
			);
			expect(location(response).searchParams.get("error")).toBe(
				"disconnect_failed",
			);
			expect(calls.filter(({ init }) => init.method === "DELETE")).toHaveLength(
				0,
			);
			expect(current?.disconnectedAt).toBeInstanceOf(Date);
			interceptor = undefined;
		}
	});
	test("explicit hook origin injection changes hook URL without changing browser return URL", async () => {
		const result = await completeGitlabConnection({
			member: { organizationId: "org_1", userId: "user_1" },
			origin: environment.GITLAB_ISSUER,
			token: "PAT_FIXTURE_TOKEN",
			auth: "token",
			identity: {
				userId: "17",
				username: "tester",
				project: { id: "29", pathWithNamespace: "team/sub/widget" },
				groupId: null,
				groupPath: "team/sub/widget",
			},
			hookApiOrigin: "https://public-hooks.example.invalid",
		});
		expect(result).toMatchObject({ connected: true, hookFailed: false });
		const hook = calls.find(({ init }) => init.method === "POST");
		expect(JSON.parse(String(hook?.init.body)).url).toBe(
			"https://public-hooks.example.invalid/api/gitlab/webhook?connection=connection_1",
		);
	});
	test("dedicated webhook origin is shared by connect/disconnect while OAuth callback remains public API", async () => {
		environment.GITLAB_WEBHOOK_ORIGIN =
			"https://public-hooks.example.invalid:8443";
		await connect.POST(
			request("connect?organizationId=org_1", { body: form() }),
		);
		const hookUrl = `${environment.GITLAB_WEBHOOK_ORIGIN}/api/gitlab/webhook?connection=connection_1`;
		const registered = calls.find(({ init }) => init.method === "POST");
		expect(JSON.parse(String(registered?.init.body)).url).toBe(hookUrl);
		calls = [];
		interceptor = async (url, init) =>
			!init.method && url.pathname.endsWith("/hooks")
				? Response.json([{ id: 53, url: hookUrl }], {
						headers: { "x-next-page": "" },
					})
				: null;
		await disconnect.POST(
			request("disconnect?organizationId=org_1", {
				body: new URLSearchParams(),
			}),
		);
		expect(calls.filter(({ init }) => init.method === "DELETE")).toHaveLength(
			1,
		);
		const started = await connect.POST(
			request("connect?organizationId=org_1", { body: oauthForm() }),
		);
		expect(location(started).searchParams.get("redirect_uri")).toBe(
			`${environment.NEXT_PUBLIC_API_URL}/api/gitlab/callback`,
		);
	});
} else {
	test("GitLab public lifecycle routes in a cleared fake-only process", () => {
		const result = Bun.spawnSync(
			[process.execPath, "--no-env-file", "test", import.meta.path],
			{
				cwd: new URL("../../../../", import.meta.url).pathname,
				env: {
					PATH: process.env.PATH ?? "",
					TMPDIR: process.env.TMPDIR ?? "/tmp",
					SUPERSET_GITLAB_LIFECYCLE_FIXTURE: "1",
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
	});
}
