import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmodSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ScriptExecutionError,
	ScriptExecutor,
	ScriptOutputError,
} from "./script-executor";
import type { DevcontainerScriptInput, SshConnectionConfig } from "./types";

function createTempScript(content: string): string {
	const path = join(
		tmpdir(),
		`test-script-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`,
	);
	writeFileSync(path, `#!/bin/bash\n${content}`);
	chmodSync(path, 0o755);
	return path;
}

const baseInput: DevcontainerScriptInput = {
	repo: "https://github.com/test/repo",
	branch: "main",
	workspaceName: "test-ws",
	workspaceId: "ws-123",
};

const baseTeardownConfig: SshConnectionConfig = {
	host: "test.example.com",
	port: 2222,
	user: "dev",
	workDir: "/workspace",
	containerName: "test-container",
};

describe("ScriptExecutor", () => {
	let executor: ScriptExecutor;
	const tempScripts: string[] = [];

	beforeEach(() => {
		executor = new ScriptExecutor();
	});

	afterEach(() => {
		for (const script of tempScripts) {
			try {
				unlinkSync(script);
			} catch {}
		}
		tempScripts.length = 0;
	});

	describe("runDevcontainerScript", () => {
		it("parses valid JSON output correctly", async () => {
			const validOutput = JSON.stringify({
				host: "remote.example.com",
				port: 2222,
				user: "dev",
				workDir: "/home/dev/workspace",
			});

			const script = createTempScript(`echo '${validOutput}'`);
			tempScripts.push(script);

			const result = await executor.runDevcontainerScript(script, baseInput);

			expect(result.host).toBe("remote.example.com");
			expect(result.port).toBe(2222);
			expect(result.user).toBe("dev");
			expect(result.workDir).toBe("/home/dev/workspace");
		});

		it("parses output with optional fields", async () => {
			const validOutput = JSON.stringify({
				host: "remote.example.com",
				port: 2222,
				user: "dev",
				workDir: "/workspace",
				identityFile: "/tmp/id_rsa",
				containerName: "my-container",
			});

			const script = createTempScript(`echo '${validOutput}'`);
			tempScripts.push(script);

			const result = await executor.runDevcontainerScript(script, baseInput);

			expect(result.identityFile).toBe("/tmp/id_rsa");
			expect(result.containerName).toBe("my-container");
		});

		it("throws ScriptExecutionError on non-zero exit", async () => {
			const script = createTempScript(
				'echo "something went wrong" >&2\nexit 1',
			);
			tempScripts.push(script);

			try {
				await executor.runDevcontainerScript(script, baseInput);
				expect.unreachable("Should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(ScriptExecutionError);
				const error = err as ScriptExecutionError;
				expect(error.stderr).toContain("something went wrong");
				expect(error.exitCode).toBe(1);
			}
		});

		it("throws ScriptOutputError on invalid JSON output", async () => {
			const script = createTempScript('echo "not valid json"');
			tempScripts.push(script);

			try {
				await executor.runDevcontainerScript(script, baseInput);
				expect.unreachable("Should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(ScriptOutputError);
				const error = err as ScriptOutputError;
				expect(error.rawOutput).toContain("not valid json");
			}
		});

		it("throws ScriptOutputError when JSON doesn't match schema", async () => {
			const invalidSchema = JSON.stringify({ foo: "bar" });
			const script = createTempScript(`echo '${invalidSchema}'`);
			tempScripts.push(script);

			try {
				await executor.runDevcontainerScript(script, baseInput);
				expect.unreachable("Should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(ScriptOutputError);
			}
		});

		it("calls progress callback with stderr lines", async () => {
			const validOutput = JSON.stringify({
				host: "remote.example.com",
				port: 2222,
				user: "dev",
				workDir: "/workspace",
			});

			const script = createTempScript(
				`echo "step 1" >&2\necho "step 2" >&2\necho '${validOutput}'`,
			);
			tempScripts.push(script);

			const progressLines: string[] = [];
			await executor.runDevcontainerScript(script, baseInput, (line) => {
				progressLines.push(line);
			});

			expect(progressLines.length).toBeGreaterThan(0);
			const joined = progressLines.join("\n");
			expect(joined).toContain("step 1");
			expect(joined).toContain("step 2");
		});
	});

	describe("runTeardownScript", () => {
		it("resolves without error on success", async () => {
			const script = createTempScript("exit 0");
			tempScripts.push(script);

			await executor.runTeardownScript(script, baseTeardownConfig);
		});

		it("resolves without error on non-zero exit (never throws)", async () => {
			const script = createTempScript('echo "teardown failed" >&2\nexit 1');
			tempScripts.push(script);

			await executor.runTeardownScript(script, baseTeardownConfig);
		});

		it("resolves without error for non-existent script", async () => {
			await executor.runTeardownScript(
				"/nonexistent/script.sh",
				baseTeardownConfig,
			);
		});

		it("calls progress callback with stderr lines", async () => {
			const script = createTempScript('echo "cleaning up" >&2\nexit 0');
			tempScripts.push(script);

			const progressLines: string[] = [];
			await executor.runTeardownScript(script, baseTeardownConfig, (line) => {
				progressLines.push(line);
			});

			const joined = progressLines.join("\n");
			expect(joined).toContain("cleaning up");
		});
	});
});
