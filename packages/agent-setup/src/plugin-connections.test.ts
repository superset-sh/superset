import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	mcpHeadersHelperCommand,
	readPluginConnections,
	writePluginConnections,
} from "./plugin-connections";

const ORIGINAL_HOME_DIR = process.env.SUPERSET_HOME_DIR;
const ORIGINAL_SANDBOX = process.env.SUPERSET_SANDBOX_WORKSPACE_ID;

let testHome: string;
// Explicit, like readInstalledPluginSources' own callers: a sibling test file
// mock.module()s "./paths" for the whole process, so the ambient path is not
// this file's to rely on.
let file: string;

beforeEach(() => {
	testHome = fs.mkdtempSync(path.join(os.tmpdir(), "superset-connections-"));
	process.env.SUPERSET_HOME_DIR = testHome;
	file = path.join(testHome, "plugins", "connections.json");
	delete process.env.SUPERSET_SANDBOX_WORKSPACE_ID;
});

afterEach(() => {
	if (ORIGINAL_HOME_DIR === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = ORIGINAL_HOME_DIR;
	if (ORIGINAL_SANDBOX === undefined)
		delete process.env.SUPERSET_SANDBOX_WORKSPACE_ID;
	else process.env.SUPERSET_SANDBOX_WORKSPACE_ID = ORIGINAL_SANDBOX;
	fs.rmSync(testHome, { recursive: true, force: true });
});

describe("the plugin connections cache", () => {
	it("round-trips the connection refs the MCP writer needs", () => {
		writePluginConnections(
			[
				{
					connector: "linear_mcp",
					connectionId: "c1",
					externalUserId: "lu-1",
					nickname: "Work",
					label: "harshith@tegon.ai",
				},
				{
					connector: "linear_mcp",
					connectionId: "c2",
					externalUserId: null,
					nickname: null,
					label: null,
				},
			],
			file,
		);

		expect(readPluginConnections(file)).toEqual([
			{
				connector: "linear_mcp",
				connectionId: "c1",
				externalUserId: "lu-1",
				nickname: "Work",
				label: "harshith@tegon.ai",
			},
			{
				connector: "linear_mcp",
				connectionId: "c2",
				externalUserId: null,
				nickname: null,
				label: null,
			},
		]);
	});

	it("reads an absent file as no connections, not as a failure", () => {
		expect(readPluginConnections(file)).toEqual([]);
	});

	// A half-written or hand-edited file must not take the MCP writer down with
	// it: one entry per connector is the correct fallback.
	it("ignores unparseable content and malformed rows", () => {
		fs.mkdirSync(path.dirname(file), { recursive: true });

		fs.writeFileSync(file, "{ not json", "utf-8");
		expect(readPluginConnections(file)).toEqual([]);

		fs.writeFileSync(
			file,
			JSON.stringify({
				connections: [
					{ connector: "linear" },
					{ connectionId: "c2" },
					{ connector: "github", connectionId: "c3", externalUserId: 7 },
				],
			}),
			"utf-8",
		);
		expect(readPluginConnections(file)).toEqual([
			{
				connector: "github",
				connectionId: "c3",
				externalUserId: null,
				nickname: null,
				label: null,
			},
		]);
	});
});

describe("the headers helper command", () => {
	// An absolute path to the shim, never the bare word: the agent runs this in
	// its own environment, which need not carry our bin dir on PATH. Asserted by
	// shape because a sibling test file mock.module()s "./paths" process-wide.
	it("names the managed shim, so the agent's own PATH does not matter", () => {
		const command = mcpHeadersHelperCommand() ?? "";
		const [binary, ...args] = command.split(" ");
		expect(path.isAbsolute(binary ?? "")).toBe(true);
		expect(binary?.endsWith(path.join("bin", "superset"))).toBe(true);
		expect(args).toEqual(["auth", "mcp-headers"]);
	});

	// The firewall adds a credential naming the workspace; the CLI there has
	// none, so a helper would print an empty bearer and fail every call.
	it("is absent in a cloud workspace", () => {
		process.env.SUPERSET_SANDBOX_WORKSPACE_ID = "ws-1";
		expect(mcpHeadersHelperCommand()).toBeUndefined();
	});
});
