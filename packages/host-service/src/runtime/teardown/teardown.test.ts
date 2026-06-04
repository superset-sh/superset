import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTeardownInitialCommand } from "./teardown";

function isFishAvailable(): boolean {
	const result = spawnSync("fish", ["-c", "exit 0"], { stdio: "ignore" });
	return result.status === 0;
}

describe("teardown initial command", () => {
	test("uses exec instead of shell-specific exit status syntax", () => {
		const command = buildTeardownInitialCommand(
			"/tmp/worktree/.superset/teardown.sh",
		);

		expect(command).toBe("exec bash '/tmp/worktree/.superset/teardown.sh'");
		expect(command).not.toContain("$?");
	});

	test("exits fish with the teardown script status", () => {
		if (!isFishAvailable()) return;

		const root = mkdtempSync(join(tmpdir(), "host-service-teardown-"));
		const dirWithQuote = join(root, "quote's dir");
		const scriptPath = join(dirWithQuote, "teardown.sh");

		try {
			mkdirSync(dirWithQuote, { recursive: true });
			writeFileSync(scriptPath, "#!/usr/bin/env bash\nexit 7\n", {
				mode: 0o755,
			});
			chmodSync(scriptPath, 0o755);

			const result = spawnSync("fish", [
				"-c",
				buildTeardownInitialCommand(scriptPath),
			]);

			expect(result.status).toBe(7);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
