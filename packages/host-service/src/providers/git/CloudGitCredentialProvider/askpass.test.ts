import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { type TempAskpass, writeTempAskpass } from "./askpass";

const generated: TempAskpass[] = [];

afterEach(() => {
	for (const entry of generated.splice(0)) {
		for (const filePath of entry.cleanupPaths) {
			rmSync(filePath, { force: true });
		}
	}
});

describe("writeTempAskpass", () => {
	test("writes a native Windows askpass command", async () => {
		const askpass = await writeTempAskpass("ghp_token&with^chars", "win32");
		generated.push(askpass);

		expect(askpass.askpassPath.endsWith(".cmd")).toBe(true);
		expect(askpass.cleanupPaths).toHaveLength(2);
		for (const filePath of askpass.cleanupPaths) {
			expect(existsSync(filePath)).toBe(true);
		}

		const username = spawnSync(askpass.askpassPath, ["Username for GitHub:"], {
			encoding: "utf8",
			shell: true,
		});
		expect(username.status).toBe(0);
		expect(username.stdout.trim()).toBe("x-access-token");

		const password = spawnSync(askpass.askpassPath, ["Password for GitHub:"], {
			encoding: "utf8",
			shell: true,
		});
		expect(password.status).toBe(0);
		expect(password.stdout.trim()).toBe("ghp_token&with^chars");
	});

	test("writes a POSIX askpass script that reads the token from a sidecar file", async () => {
		const askpass = await writeTempAskpass("token with ' quotes", "linux");
		generated.push(askpass);

		expect(askpass.askpassPath.endsWith(".sh")).toBe(true);
		expect(askpass.cleanupPaths).toHaveLength(2);
		const script = readFileSync(askpass.askpassPath, "utf8");
		expect(script).toContain("#!/bin/sh");
		expect(script).toContain("x-access-token");
		expect(script).toContain("cat ");
		expect(readFileSync(askpass.cleanupPaths[1] as string, "utf8")).toBe(
			"token with ' quotes",
		);
	});
});
