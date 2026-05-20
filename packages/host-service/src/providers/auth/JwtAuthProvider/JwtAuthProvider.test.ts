import {
	afterAll,
	afterEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
	AuthSessionExpiredMessage,
	AuthSessionRestoredMessage,
} from "../../../events";
import type { AuthSessionEventPublisher } from "../types";

type LoginResult = {
	accessToken: string;
	refreshToken?: string;
	expiresAt: number;
};

let refreshAccessTokenImpl = async (
	refreshToken: string,
): Promise<LoginResult> => ({
	accessToken: jwtWithExp(Date.now() + 60 * 60 * 1000),
	refreshToken,
	expiresAt: Date.now() + 60 * 60 * 1000,
});
const refreshAccessTokenMock = mock((refreshToken: string) =>
	refreshAccessTokenImpl(refreshToken),
);

const { JwtApiAuthProvider } = await import("./JwtAuthProvider");
const {
	AUTH_REFRESH_FAILED_MESSAGE,
	AuthRefreshFailedError,
	SESSION_EXPIRED_HINT,
} = await import("../../../errors");

const tempRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "superset-host-jwt-api-auth-"),
);

function jwtWithExp(expiresAtMs: number): string {
	const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
		"base64url",
	);
	const payload = Buffer.from(
		JSON.stringify({ exp: Math.floor(expiresAtMs / 1000) }),
	).toString("base64url");
	return `${header}.${payload}.signature`;
}

function createConfigPath(): string {
	const dir = fs.mkdtempSync(path.join(tempRoot, "case-"));
	return path.join(dir, "config.json");
}

function writeConfig(
	configPath: string,
	config: {
		auth: {
			accessToken: string;
			refreshToken?: string;
			expiresAt: number;
		};
		organizationId?: string;
		apiKey?: string;
	},
): void {
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
		mode: 0o600,
	});
}

function readConfig(configPath: string): {
	auth?: {
		accessToken: string;
		refreshToken?: string;
		expiresAt: number;
	};
	organizationId?: string;
	apiKey?: string;
} {
	return JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
		auth?: {
			accessToken: string;
			refreshToken?: string;
			expiresAt: number;
		};
		organizationId?: string;
		apiKey?: string;
	};
}

interface RecordedAuthEvents {
	eventBus: AuthSessionEventPublisher;
	expired: Array<Omit<AuthSessionExpiredMessage, "type">>;
	restored: Array<Omit<AuthSessionRestoredMessage, "type">>;
}

function createAuthEvents(): RecordedAuthEvents {
	const expired: Array<Omit<AuthSessionExpiredMessage, "type">> = [];
	const restored: Array<Omit<AuthSessionRestoredMessage, "type">> = [];
	return {
		expired,
		restored,
		eventBus: {
			broadcastAuthSessionExpired: (message) => expired.push(message),
			broadcastAuthSessionRestored: (message) => restored.push(message),
		},
	};
}

function createProvider(
	configPath: string,
	eventBus?: AuthSessionEventPublisher,
): InstanceType<typeof JwtApiAuthProvider> {
	return new JwtApiAuthProvider({
		getSessionToken: async () => "bootstrap-access-token",
		apiUrl: "https://api.example.com",
		authConfigPath: configPath,
		eventBus,
		refreshAccessToken: refreshAccessTokenMock,
	});
}

function mockNow(initialNow: number): {
	advance: (ms: number) => void;
	restore: () => void;
} {
	let now = initialNow;
	const nowSpy = spyOn(Date, "now").mockImplementation(() => now);
	return {
		advance: (ms: number) => {
			now += ms;
		},
		restore: () => nowSpy.mockRestore(),
	};
}

async function captureProcessErrors(
	run: () => Promise<void>,
): Promise<unknown[]> {
	const errors: unknown[] = [];
	const onUnhandledRejection = (reason: unknown) => {
		errors.push(reason);
	};
	const onUncaughtException = (error: Error) => {
		errors.push(error);
	};

	process.on("unhandledRejection", onUnhandledRejection);
	process.on("uncaughtException", onUncaughtException);
	try {
		await run();
		await new Promise((resolve) => setTimeout(resolve, 0));
	} finally {
		process.off("unhandledRejection", onUnhandledRejection);
		process.off("uncaughtException", onUncaughtException);
	}
	return errors;
}

afterEach(() => {
	refreshAccessTokenMock.mockClear();
	refreshAccessTokenImpl = async (refreshToken: string) => ({
		accessToken: jwtWithExp(Date.now() + 60 * 60 * 1000),
		refreshToken,
		expiresAt: Date.now() + 60 * 60 * 1000,
	});
});

afterAll(() => {
	fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("JwtApiAuthProvider", () => {
	it("delegates the JWT branch to getSessionToken once per invocation without caching", async () => {
		const accessToken = jwtWithExp(Date.now() + 60 * 60 * 1000);
		const getSessionToken = mock(async () => accessToken);
		const originalFetch = globalThis.fetch;
		const fetchMock = mock(async () => new Response(null, { status: 500 }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const provider = new JwtApiAuthProvider({
			getSessionToken,
			apiUrl: "https://api.example.com",
		});

		try {
			expect(await provider.getJwt()).toBe(accessToken);
			expect(await provider.getJwt()).toBe(accessToken);
			expect(getSessionToken).toHaveBeenCalledTimes(2);
			expect(fetchMock).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("refreshes a JWT within the leeway and persists the rotated credential atomically", async () => {
		const configPath = createConfigPath();
		const oldToken = jwtWithExp(Date.now() + 60_000);
		const refreshedToken = jwtWithExp(Date.now() + 60 * 60 * 1000);
		const refreshedExpiresAt = Date.now() + 60 * 60 * 1000;
		refreshAccessTokenImpl = async () => ({
			accessToken: refreshedToken,
			refreshToken: "rotated-refresh-token",
			expiresAt: refreshedExpiresAt,
		});
		writeConfig(configPath, {
			organizationId: "org_1",
			apiKey: "sk_live_existing",
			auth: {
				accessToken: oldToken,
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60_000,
			},
		});
		const renameSpy = spyOn(fs, "renameSync");

		const token = await createProvider(configPath).getSessionToken();

		expect(token).toBe(refreshedToken);
		expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
		expect(refreshAccessTokenMock).toHaveBeenCalledWith("refresh-token");
		expect(renameSpy).toHaveBeenCalledWith(`${configPath}.tmp`, configPath);
		expect(readConfig(configPath)).toEqual({
			organizationId: "org_1",
			apiKey: "sk_live_existing",
			auth: {
				accessToken: refreshedToken,
				refreshToken: "rotated-refresh-token",
				expiresAt: refreshedExpiresAt,
			},
		});

		renameSpy.mockRestore();
	});

	it("returns the in-memory token without refresh or config re-read when the JWT is fresh", async () => {
		const configPath = createConfigPath();
		const freshToken = jwtWithExp(Date.now() + 60 * 60 * 1000);
		writeConfig(configPath, {
			auth: {
				accessToken: freshToken,
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60 * 60 * 1000,
			},
		});
		const provider = createProvider(configPath);
		const readSpy = spyOn(fs, "readFileSync");

		expect(await provider.getSessionToken()).toBe(freshToken);
		readSpy.mockClear();

		expect(await provider.getSessionToken()).toBe(freshToken);
		expect(refreshAccessTokenMock).not.toHaveBeenCalled();
		expect(readSpy).not.toHaveBeenCalled();

		readSpy.mockRestore();
	});

	it("coalesces concurrent refresh callers into one in-flight refresh", async () => {
		const configPath = createConfigPath();
		const oldToken = jwtWithExp(Date.now() + 60_000);
		const firstRefreshedToken = jwtWithExp(Date.now() + 60_000);
		const secondRefreshedToken = jwtWithExp(Date.now() + 60 * 60 * 1000);
		let refreshCount = 0;
		refreshAccessTokenImpl = async (refreshToken: string) => {
			refreshCount += 1;
			await new Promise((resolve) => setTimeout(resolve, 10));
			return {
				accessToken:
					refreshCount === 1 ? firstRefreshedToken : secondRefreshedToken,
				refreshToken,
				expiresAt: Date.now() + 60 * 60 * 1000,
			};
		};
		writeConfig(configPath, {
			auth: {
				accessToken: oldToken,
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60_000,
			},
		});
		const provider = createProvider(configPath);

		const results = await Promise.all(
			Array.from({ length: 50 }, () => provider.getSessionToken()),
		);

		expect(new Set(results)).toEqual(new Set([firstRefreshedToken]));
		expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);

		await expect(provider.getSessionToken()).resolves.toBe(
			secondRefreshedToken,
		);
		expect(refreshAccessTokenMock).toHaveBeenCalledTimes(2);
	});

	it("throws invalid_grant AuthRefreshFailedError on a 401 refresh response", async () => {
		const configPath = createConfigPath();
		refreshAccessTokenImpl = async () => {
			throw new Error("Token refresh failed: 401");
		};
		writeConfig(configPath, {
			auth: {
				accessToken: jwtWithExp(Date.now() + 60_000),
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60_000,
			},
		});

		await expect(
			createProvider(configPath).getSessionToken(),
		).rejects.toMatchObject({
			message: AUTH_REFRESH_FAILED_MESSAGE,
			reason: "invalid_grant",
			statusCode: 401,
		});
	});

	it("classifies invalid_grant from the local OAuth refresh request without leaking the response body", async () => {
		const configPath = createConfigPath();
		writeConfig(configPath, {
			auth: {
				accessToken: jwtWithExp(Date.now() + 60_000),
				refreshToken: "refresh-token-secret",
				expiresAt: Date.now() + 60_000,
			},
		});
		const originalFetch = globalThis.fetch;
		const fetchMock = mock(
			async () =>
				new Response(
					JSON.stringify({
						error: "invalid_grant",
						refresh_token: "refresh-token-secret",
						redirect:
							"https://api.example.com/callback?code=authorization-code-secret",
					}),
					{ status: 400 },
				),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const provider = new JwtApiAuthProvider({
			getSessionToken: async () => "bootstrap-access-token",
			apiUrl: "https://api.example.com",
			authConfigPath: configPath,
		});

		try {
			await expect(provider.getSessionToken()).rejects.toMatchObject({
				message: AUTH_REFRESH_FAILED_MESSAGE,
				reason: "invalid_grant",
				statusCode: 400,
			});
			await expect(provider.getSessionToken()).rejects.toMatchObject({
				message: AUTH_REFRESH_FAILED_MESSAGE,
				reason: "invalid_grant",
				statusCode: 400,
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			expect(message).not.toContain("refresh-token-secret");
			expect(message).not.toContain("authorization-code-secret");
			throw error;
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("emits one auth:session_expired event with the exact hint and wipes refresh token on invalid_grant", async () => {
		const clock = mockNow(1_700_000_000_000);
		try {
			const configPath = createConfigPath();
			const events = createAuthEvents();
			refreshAccessTokenImpl = async () => {
				throw new Error("Token refresh failed: 401 invalid_grant");
			};
			writeConfig(configPath, {
				organizationId: "org_1",
				auth: {
					accessToken: jwtWithExp(Date.now() + 60_000),
					refreshToken: "refresh-token",
					expiresAt: Date.now() + 60_000,
				},
			});
			const provider = createProvider(configPath, events.eventBus);

			await expect(provider.getSessionToken()).rejects.toMatchObject({
				message: SESSION_EXPIRED_HINT,
				reason: "invalid_grant",
				statusCode: 401,
			});

			expect(provider.getAuthState()).toMatchObject({
				kind: "expired_permanent",
				reason: "invalid_grant",
				statusCode: 401,
			});
			expect(provider.isInAnyExpiredState()).toBe(true);
			expect(events.expired).toEqual([
				{
					reason: "invalid_grant",
					hint: SESSION_EXPIRED_HINT,
					occurredAt: Date.now(),
				},
			]);
			expect(events.restored).toEqual([]);
			expect(readConfig(configPath)).toEqual({
				organizationId: "org_1",
				auth: {
					accessToken: expect.any(String),
					expiresAt: expect.any(Number),
				},
			});

			await expect(provider.getSessionToken()).rejects.toMatchObject({
				message: SESSION_EXPIRED_HINT,
				reason: "invalid_grant",
				statusCode: 401,
			});
			expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
			expect(events.expired).toHaveLength(1);
			expect(events.restored).toHaveLength(0);
		} finally {
			clock.restore();
		}
	});

	it("records transient network failures, preserves refresh token, and suppresses retry inside 60 seconds", async () => {
		const clock = mockNow(1_700_000_000_000);
		try {
			const configPath = createConfigPath();
			const events = createAuthEvents();
			refreshAccessTokenImpl = async () => {
				throw new TypeError("fetch failed");
			};
			writeConfig(configPath, {
				auth: {
					accessToken: jwtWithExp(Date.now() + 60_000),
					refreshToken: "refresh-token",
					expiresAt: Date.now() + 60_000,
				},
			});
			const provider = createProvider(configPath, events.eventBus);

			await expect(provider.getSessionToken()).rejects.toMatchObject({
				message: SESSION_EXPIRED_HINT,
				reason: "network_error",
			});

			expect(provider.getAuthState()).toEqual({
				kind: "expired_transient",
				reason: "network_error",
				lastFailureAt: Date.now(),
				statusCode: undefined,
			});
			expect(readConfig(configPath).auth?.refreshToken).toBe("refresh-token");
			expect(events.expired).toEqual([
				{
					reason: "network_error",
					hint: SESSION_EXPIRED_HINT,
					occurredAt: Date.now(),
				},
			]);

			for (let i = 0; i < 20; i += 1) {
				clock.advance(1_000);
				await expect(provider.getSessionToken()).rejects.toMatchObject({
					message: SESSION_EXPIRED_HINT,
					reason: "network_error",
				});
			}
			expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
			expect(events.expired).toHaveLength(1);
			expect(events.restored).toHaveLength(0);
		} finally {
			clock.restore();
		}
	});

	it("records transient 5xx failures and preserves the refresh token", async () => {
		const clock = mockNow(1_700_000_000_000);
		try {
			const configPath = createConfigPath();
			const events = createAuthEvents();
			refreshAccessTokenImpl = async () => {
				throw new Error("Token refresh failed: 503");
			};
			writeConfig(configPath, {
				auth: {
					accessToken: jwtWithExp(Date.now() + 60_000),
					refreshToken: "refresh-token",
					expiresAt: Date.now() + 60_000,
				},
			});
			const provider = createProvider(configPath, events.eventBus);

			await expect(provider.getSessionToken()).rejects.toMatchObject({
				message: SESSION_EXPIRED_HINT,
				reason: "http_error",
				statusCode: 503,
			});

			expect(provider.getAuthState()).toEqual({
				kind: "expired_transient",
				reason: "http_error",
				lastFailureAt: Date.now(),
				statusCode: 503,
			});
			expect(readConfig(configPath).auth?.refreshToken).toBe("refresh-token");
			expect(events.expired).toEqual([
				{
					reason: "http_error",
					hint: SESSION_EXPIRED_HINT,
					occurredAt: Date.now(),
				},
			]);
			expect(events.restored).toEqual([]);
		} finally {
			clock.restore();
		}
	});

	it("retries a transient failure after 60 seconds and broadcasts auth:session_restored once on success", async () => {
		const clock = mockNow(1_700_000_000_000);
		try {
			const configPath = createConfigPath();
			const events = createAuthEvents();
			const refreshedToken = jwtWithExp(Date.now() + 60 * 60 * 1000);
			refreshAccessTokenImpl = async () => {
				throw new TypeError("fetch failed");
			};
			writeConfig(configPath, {
				auth: {
					accessToken: jwtWithExp(Date.now() + 60_000),
					refreshToken: "refresh-token",
					expiresAt: Date.now() + 60_000,
				},
			});
			const provider = createProvider(configPath, events.eventBus);

			await expect(provider.getSessionToken()).rejects.toMatchObject({
				reason: "network_error",
			});
			expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);

			clock.advance(61_000);
			refreshAccessTokenImpl = async (refreshToken: string) => ({
				accessToken: refreshedToken,
				refreshToken,
				expiresAt: Date.now() + 60 * 60 * 1000,
			});

			await expect(provider.getSessionToken()).resolves.toBe(refreshedToken);

			expect(refreshAccessTokenMock).toHaveBeenCalledTimes(2);
			expect(provider.getAuthState()).toEqual({ kind: "healthy" });
			expect(provider.isInAnyExpiredState()).toBe(false);
			expect(events.expired).toHaveLength(1);
			expect(events.restored).toEqual([{ occurredAt: Date.now() }]);

			await expect(provider.getSessionToken()).resolves.toBe(refreshedToken);
			expect(refreshAccessTokenMock).toHaveBeenCalledTimes(2);
			expect(events.restored).toHaveLength(1);
		} finally {
			clock.restore();
		}
	});

	it("updates transient lastFailureAt after a retry failure without re-emitting auth:session_expired", async () => {
		const clock = mockNow(1_700_000_000_000);
		try {
			const configPath = createConfigPath();
			const events = createAuthEvents();
			refreshAccessTokenImpl = async () => {
				throw new TypeError("fetch failed");
			};
			writeConfig(configPath, {
				auth: {
					accessToken: jwtWithExp(Date.now() + 60_000),
					refreshToken: "refresh-token",
					expiresAt: Date.now() + 60_000,
				},
			});
			const provider = createProvider(configPath, events.eventBus);

			await expect(provider.getSessionToken()).rejects.toMatchObject({
				reason: "network_error",
			});
			clock.advance(61_000);
			await expect(provider.getSessionToken()).rejects.toMatchObject({
				reason: "network_error",
			});

			expect(refreshAccessTokenMock).toHaveBeenCalledTimes(2);
			expect(provider.getAuthState()).toEqual({
				kind: "expired_transient",
				reason: "network_error",
				lastFailureAt: Date.now(),
				statusCode: undefined,
			});
			expect(events.expired).toHaveLength(1);
			expect(events.restored).toHaveLength(0);
		} finally {
			clock.restore();
		}
	});

	it("does not emit process-level error events for permanent or transient refresh failures", async () => {
		const errors = await captureProcessErrors(async () => {
			for (const failure of [
				() => new Error("Token refresh failed: 401 invalid_grant"),
				() => new TypeError("fetch failed"),
				() => new Error("Token refresh failed: 503"),
			]) {
				const configPath = createConfigPath();
				refreshAccessTokenImpl = async () => {
					throw failure();
				};
				writeConfig(configPath, {
					auth: {
						accessToken: jwtWithExp(Date.now() + 60_000),
						refreshToken: "refresh-token",
						expiresAt: Date.now() + 60_000,
					},
				});
				await expect(
					createProvider(configPath).getSessionToken(),
				).rejects.toBeInstanceOf(AuthRefreshFailedError);
			}
		});

		expect(errors).toEqual([]);
	});

	it("uses the exact refresh failure hint without leaking token, URL, or response body", async () => {
		const configPath = createConfigPath();
		const leakedToken = "refresh-token-secret";
		const leakedUrl =
			"https://api.example.com/api/auth/oauth2/token?refresh_token=secret";
		const leakedBody = "raw invalid_grant response body";
		refreshAccessTokenImpl = async () => {
			throw new Error(
				`Token refresh failed: 500 ${leakedToken} ${leakedUrl} ${leakedBody}`,
			);
		};
		writeConfig(configPath, {
			auth: {
				accessToken: jwtWithExp(Date.now() + 60_000),
				refreshToken: leakedToken,
				expiresAt: Date.now() + 60_000,
			},
		});

		try {
			await createProvider(configPath).getSessionToken();
			throw new Error("expected getSessionToken to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(AuthRefreshFailedError);
			const refreshError = error as InstanceType<typeof AuthRefreshFailedError>;
			expect(refreshError.message).toBe(AUTH_REFRESH_FAILED_MESSAGE);
			expect(refreshError.reason).toBe("http_error");
			expect(refreshError.statusCode).toBe(500);
			expect(refreshError.message).not.toContain(leakedToken);
			expect(refreshError.message).not.toContain(leakedUrl);
			expect(refreshError.message).not.toContain(leakedBody);
		}
	});

	it("classifies thrown fetch failures as network_error", async () => {
		const configPath = createConfigPath();
		refreshAccessTokenImpl = async () => {
			throw new TypeError("fetch failed");
		};
		writeConfig(configPath, {
			auth: {
				accessToken: jwtWithExp(Date.now() + 60_000),
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60_000,
			},
		});

		await expect(
			createProvider(configPath).getSessionToken(),
		).rejects.toMatchObject({
			message: AUTH_REFRESH_FAILED_MESSAGE,
			reason: "network_error",
		});
	});
});
