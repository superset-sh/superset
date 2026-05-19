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
import type { LoginResult } from "@superset/shared/auth/token-refresh";

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

mock.module("@superset/shared/auth/token-refresh", () => ({
	refreshAccessToken: refreshAccessTokenMock,
}));

const { JwtApiAuthProvider } = await import("./JwtApiAuthProvider");
const { AUTH_REFRESH_FAILED_MESSAGE, AuthRefreshFailedError } = await import(
	"../../../errors"
);

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

function createProvider(
	configPath: string,
): InstanceType<typeof JwtApiAuthProvider> {
	return new JwtApiAuthProvider({
		getSessionToken: async () => "bootstrap-access-token",
		apiUrl: "https://api.example.com",
		authConfigPath: configPath,
	});
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
