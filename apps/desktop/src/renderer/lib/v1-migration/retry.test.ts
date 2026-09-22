import { describe, expect, test } from "bun:test";
import {
	isTransientV1MigrationFailure,
	nextV1MigrationRetryDelayMs,
} from "./retry";

describe("isTransientV1MigrationFailure", () => {
	test.each([
		"network error",
		"Network Error",
		"TypeError: Failed to fetch",
		"fetch failed",
		"Load failed",
		"connect ECONNREFUSED 127.0.0.1:4200",
		"read ECONNRESET",
		"connect ETIMEDOUT 10.0.0.1:443",
		"socket hang up",
		"TRPCClientError: SERVICE_UNAVAILABLE",
		"service_unavailable: cloud api is restarting",
		"host-service not reachable",
		"Host-Service is unreachable at http://127.0.0.1:4200",
		"could not reach host-service",
	])("transient: %s", (reason) => {
		expect(isTransientV1MigrationFailure(reason)).toBe(true);
	});

	test.each([
		"Path does not exist: /Users/me/old-repo",
		"Not a git repository",
		"worktree is in detached-HEAD state",
		"detached HEAD",
		"project is not set up on this host",
		"multiple-candidates",
		"cloud-unreachable",
		"host-service rejected the request: FORBIDDEN",
		"UNAUTHORIZED",
		"",
	])("permanent: %s", (reason) => {
		expect(isTransientV1MigrationFailure(reason)).toBe(false);
	});
});

describe("nextV1MigrationRetryDelayMs", () => {
	test("backs off 30s, 2m, 5m then gives up", () => {
		expect(nextV1MigrationRetryDelayMs(1)).toBe(30_000);
		expect(nextV1MigrationRetryDelayMs(2)).toBe(120_000);
		expect(nextV1MigrationRetryDelayMs(3)).toBe(300_000);
		expect(nextV1MigrationRetryDelayMs(4)).toBeNull();
		expect(nextV1MigrationRetryDelayMs(10)).toBeNull();
	});

	test("rejects attempts outside the schedule", () => {
		expect(nextV1MigrationRetryDelayMs(0)).toBeNull();
		expect(nextV1MigrationRetryDelayMs(-1)).toBeNull();
		expect(nextV1MigrationRetryDelayMs(1.5)).toBeNull();
		expect(nextV1MigrationRetryDelayMs(Number.NaN)).toBeNull();
	});
});
