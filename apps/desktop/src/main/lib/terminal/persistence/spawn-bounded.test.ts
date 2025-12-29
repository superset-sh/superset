import { describe, expect, it } from "bun:test";
import { spawnWithBoundedOutput } from "./spawn-bounded";

describe("spawnWithBoundedOutput", () => {
	it("returns only the bounded tail of stdout", async () => {
		const maxStdoutBytes = 64 * 1024;
		const result = await spawnWithBoundedOutput({
			command: process.execPath,
			args: [
				"-e",
				[
					`process.stdout.write("HEAD\\n");`,
					`const chunk = "a".repeat(1024);`,
					`for (let i = 0; i < 5000; i++) process.stdout.write(chunk);`,
					`process.stdout.write("\\nTAIL");`,
				].join("\n"),
			],
			timeoutMs: 5000,
			maxStdoutBytes,
			maxStderrBytes: 4 * 1024,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("TAIL");
		expect(result.stdout).not.toContain("HEAD");
		expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(
			maxStdoutBytes,
		);
	});

	it("kills on timeout and returns partial output", async () => {
		const result = await spawnWithBoundedOutput({
			command: process.execPath,
			args: ["-e", `process.stdout.write("START"); setInterval(() => {}, 1000);`],
			timeoutMs: 50,
			maxStdoutBytes: 64 * 1024,
			maxStderrBytes: 4 * 1024,
		});

		expect(result.timedOut).toBe(true);
		expect(result.stdout).toContain("START");
	});
});

