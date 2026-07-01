import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { writeTempAskpass } from "./askpass";

describe("writeTempAskpass", () => {
	const paths: string[] = [];

	afterEach(() => {
		for (const path of paths.splice(0)) {
			rmSync(path, { force: true });
		}
	});

	test("returns the literal token for shell-special passwords", async () => {
		const token = "pa$$w'rd\" \\\\path `tick`";
		const askpassPath = await writeTempAskpass(token);
		paths.push(askpassPath);

		const username = execFileSync(
			askpassPath,
			["Username for https://example"],
			{
				encoding: "utf8",
			},
		);
		expect(username).toBe("x-access-token\n");

		const password = execFileSync(
			askpassPath,
			["Password for https://example"],
			{
				encoding: "utf8",
			},
		);
		expect(password).toBe(`${token}\n`);
	});
});
