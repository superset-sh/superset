import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePrompt } from "./command";

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("resolvePrompt", () => {
	it("accepts positional, file, and piped prompt sources", async () => {
		expect(await resolvePrompt(["follow", "up"], undefined, false)).toBe(
			"follow up",
		);
		const directory = mkdtempSync(join(tmpdir(), "cli-session-send-"));
		directories.push(directory);
		const file = join(directory, "prompt.md");
		writeFileSync(file, "from file\n");
		expect(await resolvePrompt([], file, false)).toBe("from file\n");
		expect(
			await resolvePrompt([], undefined, true, async () => "from stdin\n"),
		).toBe("from stdin\n");
	});

	it("allows --file - to name stdin without double-counting it", async () => {
		expect(
			await resolvePrompt([], "-", true, async () => "stdin via file\n"),
		).toBe("stdin via file\n");
	});

	it("rejects conflicting or empty sources", async () => {
		await expect(
			resolvePrompt(["positional"], undefined, true, async () => "piped"),
		).rejects.toThrow("exactly one prompt source");
		await expect(
			resolvePrompt([], undefined, true, async () => "  \n"),
		).rejects.toThrow("empty prompt");
	});
});
