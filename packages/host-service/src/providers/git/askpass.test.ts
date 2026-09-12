import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rm, stat } from "node:fs/promises";
import { writeTempAskpass } from "./askpass";

const written: string[] = [];

afterEach(async () => {
	await Promise.all(
		written.splice(0).map((filePath) => rm(filePath, { force: true })),
	);
});

describe("writeTempAskpass", () => {
	test("never exposes the token to other users, even before chmod", async () => {
		const filePath = await writeTempAskpass("ghp_secret");
		written.push(filePath);

		const { mode } = await stat(filePath);
		expect(mode & 0o077).toBe(0);
		expect(mode & 0o700).toBe(0o700);
		expect(await readFile(filePath, "utf8")).toContain('echo "ghp_secret"');
	});
});
