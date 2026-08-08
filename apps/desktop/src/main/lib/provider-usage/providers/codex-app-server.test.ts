import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import {
	type CodexAppServerProcess,
	createCodexAppServerReader,
} from "./codex-app-server";

function fakeServer(
	handleRequest: (request: Record<string, unknown>) => unknown,
): { process: CodexAppServerProcess; requests: Record<string, unknown>[] } {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const requests: Record<string, unknown>[] = [];
	let buffer = "";

	stdin.setEncoding("utf8");
	stdin.on("data", (chunk: string) => {
		buffer += chunk;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			if (!line) continue;
			const request = JSON.parse(line) as Record<string, unknown>;
			requests.push(request);
			const response = handleRequest(request);
			if (response) stdout.write(`${JSON.stringify(response)}\n`);
		}
	});

	return {
		process: {
			stdin,
			stdout,
			onError: () => {},
			onExit: () => {},
			close: () => {
				stdin.end();
				stdout.end();
			},
		},
		requests,
	};
}

describe("createCodexAppServerReader", () => {
	test("initializes before reading rate limits", async () => {
		const server = fakeServer((request) => {
			if (request.method === "initialize") {
				return { id: request.id, result: { codexHome: "/custom/codex" } };
			}
			if (request.method === "account/rateLimits/read") {
				return {
					id: request.id,
					result: { rateLimits: { primary: { usedPercent: 25 } } },
				};
			}
			return null;
		});
		const readRateLimits = createCodexAppServerReader({
			startServer: () => server.process,
			timeoutMs: 1_000,
		});

		await expect(readRateLimits()).resolves.toEqual({
			status: "ok",
			value: { rateLimits: { primary: { usedPercent: 25 } } },
		});
		expect(server.requests.map((request) => request.method)).toEqual([
			"initialize",
			"initialized",
			"account/rateLimits/read",
		]);
	});

	test("distinguishes a missing Codex executable from protocol failure", async () => {
		const missing = createCodexAppServerReader({
			startServer: () => {
				throw Object.assign(new Error("missing"), { code: "ENOENT" });
			},
		});
		await expect(missing()).resolves.toEqual({ status: "not-configured" });

		const broken = createCodexAppServerReader({
			startServer: () => {
				throw new Error("broken");
			},
		});
		await expect(broken()).resolves.toEqual({ status: "unavailable" });
	});
});
