import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getEnvHostEndpoint } from "./env-endpoint";

describe("getEnvHostEndpoint", () => {
	let tempDir: string;
	let savedEndpoint: string | undefined;
	let savedTokenFile: string | undefined;

	beforeEach(() => {
		tempDir = mkdtempSync(path.join(tmpdir(), "superset-env-endpoint-"));
		savedEndpoint = process.env.SUPERSET_HOST_ENDPOINT;
		savedTokenFile = process.env.SUPERSET_HOST_TOKEN_FILE;
		delete process.env.SUPERSET_HOST_ENDPOINT;
		delete process.env.SUPERSET_HOST_TOKEN_FILE;
	});

	afterEach(() => {
		if (savedEndpoint === undefined) delete process.env.SUPERSET_HOST_ENDPOINT;
		else process.env.SUPERSET_HOST_ENDPOINT = savedEndpoint;
		if (savedTokenFile === undefined)
			delete process.env.SUPERSET_HOST_TOKEN_FILE;
		else process.env.SUPERSET_HOST_TOKEN_FILE = savedTokenFile;
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("returns null when the endpoint override is unset", () => {
		expect(getEnvHostEndpoint()).toBeNull();
	});

	test("reads the token from the file next to the endpoint", () => {
		const tokenPath = path.join(tempDir, "token");
		writeFileSync(tokenPath, "secret-token\n");
		process.env.SUPERSET_HOST_ENDPOINT = "http://host.docker.internal:48123";
		process.env.SUPERSET_HOST_TOKEN_FILE = tokenPath;
		expect(getEnvHostEndpoint()).toEqual({
			endpoint: "http://host.docker.internal:48123",
			authToken: "secret-token",
		});
	});

	test("throws an actionable error when the token file is missing or empty", () => {
		process.env.SUPERSET_HOST_ENDPOINT = "http://host.docker.internal:48123";
		expect(() => getEnvHostEndpoint()).toThrow(/SUPERSET_HOST_TOKEN_FILE/);

		const emptyPath = path.join(tempDir, "empty");
		writeFileSync(emptyPath, "");
		process.env.SUPERSET_HOST_TOKEN_FILE = emptyPath;
		expect(() => getEnvHostEndpoint()).toThrow(/empty/);

		process.env.SUPERSET_HOST_TOKEN_FILE = path.join(tempDir, "missing");
		expect(() => getEnvHostEndpoint()).toThrow(/Failed to read/);
	});
});
