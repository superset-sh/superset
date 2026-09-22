import { describe, expect, it } from "bun:test";
import { runTolerant } from "./exec.ts";

const options = { maxBuffer: 1024, timeout: 5000 };

describe("runTolerant", () => {
	it("returns stdout on success", async () => {
		expect(
			await runTolerant(
				process.execPath,
				["-e", 'process.stdout.write("ok")'],
				options,
			),
		).toBe("ok");
	});

	it("preserves partial results from a numeric nonzero exit", async () => {
		expect(
			await runTolerant(
				process.execPath,
				["-e", 'process.stdout.write("partial"); process.exitCode = 1'],
				options,
			),
		).toBe("partial");
	});

	it("rejects truncated output on maxBuffer overflow", async () => {
		await expect(
			runTolerant(
				process.execPath,
				["-e", 'process.stdout.write("x".repeat(4096))'],
				{ ...options, maxBuffer: 1 },
			),
		).rejects.toThrow();
	});

	it("rejects spawn failures instead of returning empty stdout", async () => {
		await expect(
			runTolerant("/nonexistent-superset-test-executable", [], options),
		).rejects.toThrow();
	});

	it("propagates cancellation", async () => {
		await expect(
			runTolerant(process.execPath, ["-e", ""], {
				...options,
				signal: AbortSignal.abort(),
			}),
		).rejects.toThrow();
	});
});
