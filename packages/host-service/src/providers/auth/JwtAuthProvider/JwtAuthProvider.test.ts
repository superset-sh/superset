import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import SuperJSON from "superjson";
import { createApiClient } from "../../../api";
import { ConfigFileSessionTokenSource } from "../ConfigFileSessionTokenSource";
import { JwtApiAuthProvider } from "./JwtAuthProvider";

const originalFetch = globalThis.fetch;
const API_URL = "https://api.superset.test";
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

type SupersetTestConfig = {
	auth?: {
		accessToken: string;
		refreshToken?: string;
		expiresAt: number;
	};
	apiKey?: string;
	organizationId?: string;
};

type TestConfigFile = {
	dir: string;
	configPath: string;
};

function createConfigFile(config: SupersetTestConfig): TestConfigFile {
	const dir = mkdtempSync(join(tmpdir(), "host-auth-config-"));
	const configPath = join(dir, "config.json");
	writeFileSync(configPath, JSON.stringify(config, null, 2));
	return { dir, configPath };
}

function readConfig(configPath: string): SupersetTestConfig {
	return JSON.parse(readFileSync(configPath, "utf-8")) as SupersetTestConfig;
}

function writeConfig(configPath: string, config: SupersetTestConfig): void {
	writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function createConfigBackedProvider(configPath: string): JwtApiAuthProvider {
	const tokenSource = new ConfigFileSessionTokenSource({
		configPath,
		apiUrl: API_URL,
	});
	return new JwtApiAuthProvider({
		getSessionToken: () => tokenSource.getSessionToken(),
		onInvalidateCache: () => tokenSource.invalidateCache(),
		apiUrl: API_URL,
	});
}

function mockFetch(
	impl: (
		input: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	) => Promise<Response>,
) {
	const fetchMock = mock(impl);
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	return fetchMock;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("JwtApiAuthProvider with config-backed host auth", () => {
	test("returns the config access token before 401 invalidation", async () => {
		const { dir, configPath } = createConfigFile({
			auth: {
				accessToken: "stored.jwt.token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() - 1000,
			},
		});
		const fetchMock = mockFetch(async () => {
			throw new Error("unexpected fetch");
		});

		try {
			await expect(
				createConfigBackedProvider(configPath).getHeaders(),
			).resolves.toEqual({
				Authorization: "Bearer stored.jwt.token",
			});
			expect(fetchMock).not.toHaveBeenCalled();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("refreshes from config after 401 invalidation and persists rotated auth", async () => {
		const { dir, configPath } = createConfigFile({
			auth: {
				accessToken: "stale.jwt.token",
				refreshToken: "old-refresh-token",
				expiresAt: Date.now() - 1000,
			},
			organizationId: ORGANIZATION_ID,
		});
		const fetchMock = mockFetch(async () =>
			Response.json({
				access_token: "refreshed.jwt.token",
				refresh_token: "rotated-refresh-token",
				expires_in: 3600,
			}),
		);
		const authProvider = createConfigBackedProvider(configPath);

		try {
			await expect(authProvider.getHeaders()).resolves.toEqual({
				Authorization: "Bearer stale.jwt.token",
			});

			authProvider.invalidateCache();

			await expect(authProvider.getHeaders()).resolves.toEqual({
				Authorization: "Bearer refreshed.jwt.token",
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const updated = readConfig(configPath);
			expect(updated.organizationId).toBe(ORGANIZATION_ID);
			expect(updated.auth?.accessToken).toBe("refreshed.jwt.token");
			expect(updated.auth?.refreshToken).toBe("rotated-refresh-token");
			expect(updated.auth?.expiresAt ?? 0).toBeGreaterThan(Date.now());
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("a cloud 401 retries once with a refreshed config token", async () => {
		const { dir, configPath } = createConfigFile({
			auth: {
				accessToken: "stale.jwt.token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() - 1000,
			},
		});
		const t = initTRPC.context<{ headers: Headers }>().create({
			transformer: SuperJSON,
		});
		const seenAuthHeaders: string[] = [];
		const cloudRouter = t.router({
			user: t.router({
				me: t.procedure.query(({ ctx }) => {
					const authorization = ctx.headers.get("authorization") ?? "";
					seenAuthHeaders.push(authorization);
					expect(ctx.headers.get(ORGANIZATION_HEADER)).toBe(ORGANIZATION_ID);

					if (authorization === "Bearer stale.jwt.token") {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "stale token",
						});
					}

					expect(authorization).toBe("Bearer refreshed.jwt.token");
					return { id: "user-1", email: "test@superset.local" };
				}),
			}),
		});
		const fetchMock = mockFetch(async (input, init) => {
			const request =
				input instanceof Request ? input : new Request(input.toString(), init);
			const url = new URL(request.url);
			if (url.pathname === "/api/auth/oauth2/token") {
				return Response.json({
					access_token: "refreshed.jwt.token",
					refresh_token: "rotated-refresh-token",
					expires_in: 3600,
				});
			}
			if (url.pathname.startsWith("/api/trpc")) {
				return fetchRequestHandler({
					endpoint: "/api/trpc",
					req: request,
					router: cloudRouter,
					createContext: () => ({ headers: request.headers }),
				});
			}
			return new Response("not found", { status: 404 });
		});
		const api = createApiClient(
			API_URL,
			createConfigBackedProvider(configPath),
			ORGANIZATION_ID,
		);

		try {
			await expect(api.user.me.query()).resolves.toMatchObject({
				id: "user-1",
			});
			expect(seenAuthHeaders).toEqual([
				"Bearer stale.jwt.token",
				"Bearer refreshed.jwt.token",
			]);
			expect(fetchMock).toHaveBeenCalledTimes(3);
			expect(readConfig(configPath).auth?.refreshToken).toBe(
				"rotated-refresh-token",
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("concurrent retry callers perform one refresh", async () => {
		const { dir, configPath } = createConfigFile({
			auth: {
				accessToken: "stale.jwt.token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() - 1000,
			},
		});
		let releaseRefresh: (() => void) | undefined;
		const refreshStarted = new Promise<void>((resolve) => {
			releaseRefresh = resolve;
		});
		const fetchMock = mockFetch(async () => {
			await refreshStarted;
			return Response.json({
				access_token: "refreshed.jwt.token",
				refresh_token: "rotated-refresh-token",
				expires_in: 3600,
			});
		});
		const authProvider = createConfigBackedProvider(configPath);

		try {
			authProvider.invalidateCache();
			const resultsPromise = Promise.all([
				authProvider.getHeaders(),
				authProvider.getHeaders(),
				authProvider.getHeaders(),
			]);
			await Promise.resolve();
			releaseRefresh?.();

			await expect(resultsPromise).resolves.toEqual([
				{ Authorization: "Bearer refreshed.jwt.token" },
				{ Authorization: "Bearer refreshed.jwt.token" },
				{ Authorization: "Bearer refreshed.jwt.token" },
			]);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("missing refresh token fails with login guidance after invalidation", async () => {
		const { dir, configPath } = createConfigFile({
			auth: {
				accessToken: "stale.jwt.token",
				expiresAt: Date.now() - 1000,
			},
		});
		const fetchMock = mockFetch(async () => {
			throw new Error("unexpected fetch");
		});
		const authProvider = createConfigBackedProvider(configPath);

		try {
			authProvider.invalidateCache();
			await expect(authProvider.getHeaders()).rejects.toThrow(
				/superset auth login/,
			);
			expect(fetchMock).not.toHaveBeenCalled();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("failed refresh errors are sanitized", async () => {
		const { dir, configPath } = createConfigFile({
			auth: {
				accessToken: "stale.jwt.token",
				refreshToken: "refresh-secret",
				expiresAt: Date.now() - 1000,
			},
		});
		mockFetch(
			async () =>
				new Response(
					JSON.stringify({
						access_token: "access-secret",
						refresh_token: "refresh-secret",
						redirect: "https://app.superset.test/callback?code=code-secret",
						cookie: "session=session-secret",
					}),
					{ status: 400 },
				),
		);
		const authProvider = createConfigBackedProvider(configPath);

		try {
			authProvider.invalidateCache();
			let thrown: unknown;
			try {
				await authProvider.getHeaders();
			} catch (error) {
				thrown = error;
			}

			const message = thrown instanceof Error ? thrown.message : String(thrown);
			expect(message).toContain("superset auth login");
			expect(message).not.toContain("access-secret");
			expect(message).not.toContain("refresh-secret");
			expect(message).not.toContain("session-secret");
			expect(message).not.toContain("code-secret");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("skips writing refreshed auth if on-disk auth changed during refresh", async () => {
		const { dir, configPath } = createConfigFile({
			auth: {
				accessToken: "stale.jwt.token",
				refreshToken: "old-refresh-token",
				expiresAt: Date.now() - 1000,
			},
		});
		const fetchMock = mockFetch(async () => {
			writeConfig(configPath, {
				auth: {
					accessToken: "external.jwt.token",
					refreshToken: "external-refresh-token",
					expiresAt: Date.now() + 60 * 60 * 1000,
				},
			});
			return Response.json({
				access_token: "refreshed.jwt.token",
				refresh_token: "rotated-refresh-token",
				expires_in: 3600,
			});
		});
		const authProvider = createConfigBackedProvider(configPath);

		try {
			authProvider.invalidateCache();
			await expect(authProvider.getHeaders()).resolves.toEqual({
				Authorization: "Bearer external.jwt.token",
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(readConfig(configPath).auth).toMatchObject({
				accessToken: "external.jwt.token",
				refreshToken: "external-refresh-token",
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("static AUTH_TOKEN behavior is unchanged without a config source", async () => {
		const fetchMock = mockFetch(async () => {
			throw new Error("unexpected fetch");
		});
		const authProvider = new JwtApiAuthProvider({
			getSessionToken: async () => "static.jwt.token",
			apiUrl: API_URL,
		});

		await expect(authProvider.getHeaders()).resolves.toEqual({
			Authorization: "Bearer static.jwt.token",
		});
		authProvider.invalidateCache();
		await expect(authProvider.getHeaders()).resolves.toEqual({
			Authorization: "Bearer static.jwt.token",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
