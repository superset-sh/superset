import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const ENV_KEY = "SUPERSET_CHAT_MASTRA_MCP_ENABLED";

describe("isMastraMcpEnabled", () => {
	let originalValue: string | undefined;

	beforeEach(() => {
		originalValue = process.env[ENV_KEY];
	});

	afterEach(() => {
		if (originalValue === undefined) {
			delete process.env[ENV_KEY];
		} else {
			process.env[ENV_KEY] = originalValue;
		}
	});

	it("is enabled by default when env var is not set", async () => {
		delete process.env[ENV_KEY];
		// Re-import to bypass module-level caching — mcp-gate reads env at call time
		const { isMastraMcpEnabled } = await import("./mcp-gate");
		expect(isMastraMcpEnabled()).toBe(true);
	});

	it("remains enabled when env var is an empty string", async () => {
		process.env[ENV_KEY] = "";
		const { isMastraMcpEnabled } = await import("./mcp-gate");
		expect(isMastraMcpEnabled()).toBe(true);
	});

	it("can be explicitly disabled with '0'", async () => {
		process.env[ENV_KEY] = "0";
		const { isMastraMcpEnabled } = await import("./mcp-gate");
		expect(isMastraMcpEnabled()).toBe(false);
	});

	it("can be explicitly disabled with 'false'", async () => {
		process.env[ENV_KEY] = "false";
		const { isMastraMcpEnabled } = await import("./mcp-gate");
		expect(isMastraMcpEnabled()).toBe(false);
	});

	it("is enabled when env var is set to '1'", async () => {
		process.env[ENV_KEY] = "1";
		const { isMastraMcpEnabled } = await import("./mcp-gate");
		expect(isMastraMcpEnabled()).toBe(true);
	});
});
