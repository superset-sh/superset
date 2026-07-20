import { afterEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	cleanupAgentLaunch,
	type PreparedAgentLaunch,
	prepareAgentLaunch,
	waitForAgentLaunch,
	withPreparedAgentLaunch,
} from "./agent-launch";

const launches: PreparedAgentLaunch[] = [];
const extraDirectories: string[] = [];

afterEach(() => {
	for (const launch of launches.splice(0)) cleanupAgentLaunch(launch);
	for (const directory of extraDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("prepareAgentLaunch", () => {
	it("keeps a large Unicode prompt out of the interactive PTY command", () => {
		const prompt = `${"line with Unicode 🎉 中文\n".repeat(4096)}tail\n\n`;
		const launch = prepareAgentLaunch({
			command: "codex",
			args: ["--model", "gpt-test"],
			promptArgs: ["--prompt"],
			promptTransport: "argv",
			prompt,
			env: { AGENT_SETTING: "value with spaces" },
		});
		launches.push(launch);

		expect(Buffer.byteLength(prompt)).toBeGreaterThan(64 * 1024);
		expect(readFileSync(launch.promptPath, "utf8")).toBe(prompt);
		expect(launch.initialCommand.length).toBeLessThan(512);
		expect(launch.initialCommand).not.toContain("line with Unicode");
		expect(readFileSync(launch.scriptPath, "utf8")).not.toContain(prompt);
		expect(statSync(launch.promptPath).mode & 0o777).toBe(0o600);
		expect(statSync(launch.scriptPath).mode & 0o777).toBe(0o700);
	});

	it("quotes the short launcher path for interactive shells such as fish", () => {
		const baseDir = mkdtempSync(join(tmpdir(), "superset launch's base "));
		extraDirectories.push(baseDir);
		chmodSync(baseDir, 0o700);
		const launch = prepareAgentLaunch({
			command: "agent",
			args: [],
			promptArgs: [],
			promptTransport: "stdin",
			prompt: "prompt",
			env: {},
			baseDir,
		});
		launches.push(launch);

		expect(launch.initialCommand).toBe(
			`'/bin/sh' '${launch.scriptPath.replaceAll("'", "'\\''")}'`,
		);
	});

	it("removes sensitive launch artifacts when scoped work throws", async () => {
		let launchDir: string | undefined;
		await expect(
			withPreparedAgentLaunch(
				{
					command: "agent",
					args: [],
					promptArgs: [],
					promptTransport: "argv",
					prompt: "sensitive prompt",
					env: {},
				},
				async (launch) => {
					launchDir = launch.launchDir;
					expect(existsSync(launch.promptPath)).toBe(true);
					throw new Error("session creation failed");
				},
			),
		).rejects.toThrow("session creation failed");

		expect(launchDir).toBeDefined();
		expect(existsSync(launchDir as string)).toBe(false);
	});
});

describe("waitForAgentLaunch", () => {
	it("reports a launcher error instead of a false-success terminal id", async () => {
		const launch = prepareAgentLaunch({
			command: "/definitely/missing/superset-agent",
			args: [],
			promptArgs: [],
			promptTransport: "argv",
			prompt: "prompt",
			env: {},
		});
		launches.push(launch);

		const child = Bun.spawn([launch.scriptPath], {
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
		});

		await expect(
			waitForAgentLaunch(launch, { timeoutMs: 2000 }),
		).rejects.toThrow("exited before launch acknowledgement");
		await child.exited;
	});
});
