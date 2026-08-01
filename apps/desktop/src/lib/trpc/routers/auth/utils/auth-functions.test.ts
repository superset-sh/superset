import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const testSupersetHomeDir = fs.mkdtempSync(
	path.join(os.tmpdir(), "auth-functions-test-"),
);
process.env.SUPERSET_HOME_DIR = testSupersetHomeDir;
const tokenFile = path.join(testSupersetHomeDir, "auth-token.enc");

// Keep this unit test independent from suite-global host-info mocks. The
// persistence behavior under test only needs a reversible storage boundary.
mock.module("./crypto-storage", () => ({
	encrypt: (plaintext: string) => Buffer.from(plaintext),
	decrypt: (data: Buffer) => data.toString("utf8"),
}));

const { authEvents, clearToken, loadToken, saveOrganizationIds, saveToken } =
	await import("./auth-functions");

beforeEach(() => {
	fs.rmSync(tokenFile, { recursive: true, force: true });
});

afterAll(() => {
	fs.rmSync(testSupersetHomeDir, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
});

describe("cached organization membership", () => {
	test("stores a normalized membership set alongside the encrypted token", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01" });
		const membershipSaved = mock(() => {});
		authEvents.once("organization-ids-saved", membershipSaved);

		await saveOrganizationIds({
			token: "token",
			organizationIds: ["org-2", "org-1", "org-2"],
			expectedRevision: 0,
		});

		expect(await loadToken()).toEqual({
			token: "token",
			expiresAt: "2099-01-01",
			organizationIds: ["org-1", "org-2"],
			organizationIdsRevision: 1,
		});
		expect(membershipSaved).toHaveBeenCalledWith({
			token: "token",
			organizationIds: ["org-1", "org-2"],
		});
	});

	test("confirms unchanged membership for the current app process", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01" });
		await saveOrganizationIds({
			token: "token",
			organizationIds: ["org-1", "org-2"],
			expectedRevision: 0,
		});
		const membershipSaved = mock(() => {});
		authEvents.once("organization-ids-saved", membershipSaved);

		await saveOrganizationIds({
			token: "token",
			organizationIds: ["org-2", "org-1"],
			expectedRevision: 1,
		});

		expect(membershipSaved).toHaveBeenCalledWith({
			token: "token",
			organizationIds: ["org-1", "org-2"],
		});
	});

	test("clears cached membership when a different token is saved", async () => {
		await saveToken({ token: "old-token", expiresAt: "2099-01-01" });
		await saveOrganizationIds({
			token: "old-token",
			organizationIds: ["old-org"],
			expectedRevision: 0,
		});

		await saveToken({ token: "new-token", expiresAt: "2099-02-01" });

		expect(await loadToken()).toEqual({
			token: "new-token",
			expiresAt: "2099-02-01",
			organizationIds: null,
			organizationIdsRevision: 0,
		});
	});

	test("ignores membership from a stale account session", async () => {
		await saveToken({ token: "new-token", expiresAt: "2099-02-01" });

		await saveOrganizationIds({
			token: "old-token",
			organizationIds: ["old-org"],
			expectedRevision: 0,
		});

		expect(await loadToken()).toEqual({
			token: "new-token",
			expiresAt: "2099-02-01",
			organizationIds: null,
			organizationIdsRevision: 0,
		});
	});

	test("does not let stale membership recreate auth after sign-out", async () => {
		await saveToken({ token: "old-token", expiresAt: "2099-01-01" });
		await clearToken();

		await saveOrganizationIds({
			token: "old-token",
			organizationIds: ["old-org"],
			expectedRevision: 0,
		});

		expect(await loadToken()).toEqual({
			token: null,
			expiresAt: null,
			organizationIds: null,
			organizationIdsRevision: 0,
		});
	});

	test("ignores a delayed retry from an older membership snapshot", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01" });
		await saveOrganizationIds({
			token: "token",
			organizationIds: ["current-org"],
			expectedRevision: 0,
		});

		const result = await saveOrganizationIds({
			token: "token",
			organizationIds: ["removed-org"],
			expectedRevision: 0,
		});

		expect(result).toEqual({ status: "conflict", revision: 1 });
		expect(await loadToken()).toEqual({
			token: "token",
			expiresAt: "2099-01-01",
			organizationIds: ["current-org"],
			organizationIdsRevision: 1,
		});
	});

	test("surfaces unexpected cache read failures to the retrying mutation", async () => {
		fs.mkdirSync(tokenFile);

		await expect(
			saveOrganizationIds({
				token: "token",
				organizationIds: ["org-1"],
				expectedRevision: 0,
			}),
		).rejects.toThrow();
	});

	test("does not report sign-out when stored credentials cannot be removed", async () => {
		fs.mkdirSync(tokenFile);
		const tokenCleared = mock(() => {});
		authEvents.once("token-cleared", tokenCleared);

		await expect(clearToken()).rejects.toThrow();
		expect(tokenCleared).not.toHaveBeenCalled();
		authEvents.off("token-cleared", tokenCleared);
	});
});
