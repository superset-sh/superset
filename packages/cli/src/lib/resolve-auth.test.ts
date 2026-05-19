import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LoginResult } from "@superset/shared/auth/token-refresh";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = fs.mkdtempSync(
	path.join(os.tmpdir(), "superset-cli-resolve-auth-"),
);
process.env.SUPERSET_HOME_DIR = tempHome;

interface HostServiceManifest {
	pid: number;
	endpoint: string;
	authToken: string;
	startedAt: number;
	organizationId: string;
}

let refreshAccessTokenImpl = async (
	refreshToken: string,
): Promise<LoginResult> => ({
	accessToken: "refreshed-access-token",
	refreshToken,
	expiresAt: Date.now() + 60 * 60 * 1000,
});
const refreshAccessTokenMock = mock((refreshToken: string) =>
	refreshAccessTokenImpl(refreshToken),
);

let hostManifest: HostServiceManifest | null = null;
const alivePids = new Set<number>();
const readManifestMock = mock((organizationId: string) =>
	hostManifest?.organizationId === organizationId ? hostManifest : null,
);
const isProcessAliveMock = mock((pid: number) => alivePids.has(pid));

mock.module("@superset/shared/auth/token-refresh", () => ({
	refreshAccessToken: refreshAccessTokenMock,
}));

mock.module("./host/manifest", () => ({
	readManifest: readManifestMock,
	isProcessAlive: isProcessAliveMock,
}));

const { resolveAuth } = await import("./resolve-auth");
const { readConfig, writeConfig } = await import("./config");

function clearConfig(): void {
	writeConfig({});
}

afterEach(() => {
	clearConfig();
	refreshAccessTokenMock.mockClear();
	refreshAccessTokenImpl = async (refreshToken: string) => ({
		accessToken: "refreshed-access-token",
		refreshToken,
		expiresAt: Date.now() + 60 * 60 * 1000,
	});
	hostManifest = null;
	alivePids.clear();
	readManifestMock.mockClear();
	isProcessAliveMock.mockClear();
});

afterAll(() => {
	fs.rmSync(tempHome, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
});

describe("resolveAuth", () => {
	it("throws when no override and no stored credentials", async () => {
		await expect(resolveAuth(undefined)).rejects.toThrow(/Not logged in/);
	});

	it("uses an override api key with 'override' source", async () => {
		const result = await resolveAuth("sk_live_override");
		expect(result.bearer).toBe("sk_live_override");
		expect(result.authSource).toBe("override");
	});

	it("uses a stored apiKey from config with 'config' source", async () => {
		writeConfig({ apiKey: "sk_live_stored", organizationId: "org_1" });
		const result = await resolveAuth(undefined);
		expect(result.bearer).toBe("sk_live_stored");
		expect(result.authSource).toBe("config");
		expect(result.config.organizationId).toBe("org_1");
	});

	it("uses a stored OAuth session when present and unexpired", async () => {
		const future = Date.now() + 60 * 60 * 1000;
		writeConfig({
			auth: {
				accessToken: "oauth-token",
				refreshToken: "oauth-refresh",
				expiresAt: future,
			},
		});
		const result = await resolveAuth(undefined);
		expect(result.bearer).toBe("oauth-token");
		expect(result.authSource).toBe("oauth");
	});

	it("defers OAuth refresh to the host while the host process is alive", async () => {
		const pid = 24_680;
		writeConfig({
			organizationId: "org_1",
			auth: {
				accessToken: "near-expiry-access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60_000,
			},
		});
		hostManifest = {
			pid,
			endpoint: "http://127.0.0.1:4879",
			authToken: "host-secret",
			startedAt: Date.now(),
			organizationId: "org_1",
		};
		alivePids.add(pid);

		const result = await resolveAuth(undefined);

		expect(result.bearer).toBe("near-expiry-access-token");
		expect(result.authSource).toBe("oauth");
		expect(refreshAccessTokenMock).not.toHaveBeenCalled();
		expect(readManifestMock).toHaveBeenCalledWith("org_1");
		expect(isProcessAliveMock).toHaveBeenCalledWith(pid);
		expect(readConfig().auth?.accessToken).toBe("near-expiry-access-token");
	});

	it("refreshes OAuth credentials when the host manifest process is not alive", async () => {
		const pid = 24_681;
		const refreshedExpiresAt = Date.now() + 60 * 60 * 1000;
		refreshAccessTokenImpl = async () => ({
			accessToken: "refreshed-access-token",
			refreshToken: "rotated-refresh-token",
			expiresAt: refreshedExpiresAt,
		});
		writeConfig({
			organizationId: "org_1",
			auth: {
				accessToken: "near-expiry-access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60_000,
			},
		});
		hostManifest = {
			pid,
			endpoint: "http://127.0.0.1:4879",
			authToken: "host-secret",
			startedAt: Date.now(),
			organizationId: "org_1",
		};

		const result = await resolveAuth(undefined);

		expect(result.bearer).toBe("refreshed-access-token");
		expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
		expect(refreshAccessTokenMock).toHaveBeenCalledWith("refresh-token");
		expect(isProcessAliveMock).toHaveBeenCalledWith(pid);
		expect(readConfig().auth).toEqual({
			accessToken: "refreshed-access-token",
			refreshToken: "rotated-refresh-token",
			expiresAt: refreshedExpiresAt,
		});
	});

	it("refreshes OAuth credentials when no host manifest exists", async () => {
		writeConfig({
			organizationId: "org_1",
			auth: {
				accessToken: "near-expiry-access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60_000,
			},
		});

		const result = await resolveAuth(undefined);

		expect(result.bearer).toBe("refreshed-access-token");
		expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
		expect(readManifestMock).toHaveBeenCalledWith("org_1");
		expect(isProcessAliveMock).not.toHaveBeenCalled();
	});

	it("throws when OAuth session is expired and there is no refresh token", async () => {
		writeConfig({
			auth: { accessToken: "stale", expiresAt: Date.now() - 1000 },
		});
		await expect(resolveAuth(undefined)).rejects.toThrow(/Session expired/);
	});

	it("prefers an override over a stored apiKey", async () => {
		writeConfig({ apiKey: "sk_live_stored" });
		const result = await resolveAuth("sk_live_override");
		expect(result.bearer).toBe("sk_live_override");
		expect(result.authSource).toBe("override");
	});

	it("prefers a stored apiKey over a stored OAuth session", async () => {
		writeConfig({
			apiKey: "sk_live_stored",
			auth: {
				accessToken: "oauth-token",
				expiresAt: Date.now() + 60 * 60 * 1000,
			},
		});
		const result = await resolveAuth(undefined);
		expect(result.bearer).toBe("sk_live_stored");
		expect(result.authSource).toBe("config");
	});
});
