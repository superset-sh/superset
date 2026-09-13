import { afterAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getPiExtensionContent } from "./agent-wrappers-pi";

const directory = mkdtempSync(join(tmpdir(), "pi-notification-test-"));
const extensionPath = join(directory, "extension.ts");
writeFileSync(extensionPath, getPiExtensionContent());
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("Pi completion notifications", () => {
	it.each([
		{
			stopReason: "stop",
			text: "Checks passed.",
			errorMessage: undefined,
			event: "Stop",
			preview: "Checks passed.",
		},
		{
			stopReason: "error",
			text: "",
			errorMessage: "No API key for provider: anthropic",
			event: "Failed",
			preview: "No API key for provider: anthropic",
		},
	])("maps $stopReason to $event with the actual content", async (scenario) => {
		const home = mkdtempSync(join(directory, "home-"));
		const output = join(home, "payload.json");
		mkdirSync(join(home, "hooks"));
		writeFileSync(
			join(home, "hooks", "notify.sh"),
			`#!/bin/bash\ncat > '${output}'\n`,
			{ mode: 0o755 },
		);
		const previousHome = process.env.SUPERSET_HOME_DIR;
		const previousTerminal = process.env.SUPERSET_TERMINAL_ID;
		process.env.SUPERSET_HOME_DIR = home;
		process.env.SUPERSET_TERMINAL_ID = "test-terminal";
		try {
			const extension = (await import(pathToFileURL(extensionPath).href))
				.default;
			const handlers = new Map<
				string,
				(event: unknown, context: unknown) => void
			>();
			extension({
				on: (
					event: string,
					handler: (event: unknown, context: unknown) => void,
				) => handlers.set(event, handler),
			});
			handlers.get("agent_end")?.(
				{
					messages: [
						{
							role: "assistant",
							stopReason: scenario.stopReason,
							errorMessage: scenario.errorMessage,
							content: [{ type: "text", text: scenario.text }],
						},
					],
				},
				{ hasUI: true },
			);
			let payload: unknown;
			for (let i = 0; i < 100; i++) {
				try {
					payload = JSON.parse(readFileSync(output, "utf8"));
					break;
				} catch {
					await Bun.sleep(10);
				}
			}
			expect(payload).toEqual({
				hook_event_name: scenario.event,
				message: scenario.preview,
			});
		} finally {
			if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
			else process.env.SUPERSET_HOME_DIR = previousHome;
			if (previousTerminal === undefined)
				delete process.env.SUPERSET_TERMINAL_ID;
			else process.env.SUPERSET_TERMINAL_ID = previousTerminal;
		}
	});
});
