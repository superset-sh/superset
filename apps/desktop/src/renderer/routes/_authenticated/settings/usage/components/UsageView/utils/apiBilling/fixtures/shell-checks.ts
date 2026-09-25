import { afterEach, expect, it } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: shell integration test executes the generated command
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
// biome-ignore lint/style/noRestrictedImports: shell integration test uses a temporary directory
import { tmpdir } from "node:os";
// biome-ignore lint/style/noRestrictedImports: shell integration test uses filesystem paths
import { join } from "node:path";
import { apiBillingLoginCommand } from "../apiBilling";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});
for (const exitCode of [0, 1])
	it(`preserves Codex exit ${exitCode} while clearing the key`, async () => {
		const dir = await mkdtemp(join(tmpdir(), "superset-api-login-"));
		dirs.push(dir);
		await writeFile(
			join(dir, "codex"),
			`#!/bin/sh\ncat >/dev/null\nexit ${exitCode}\n`,
			{ mode: 0o755 },
		);
		const command = apiBillingLoginCommand("codex", `'${dir}'`);
		const result = spawnSync("/bin/bash", ["-c", command], {
			cwd: dir,
			env: { HOME: dir, PATH: `${dir}:/usr/bin:/bin` },
			input: "fake-test-key\n",
			encoding: "utf8",
		});

		expect(result.stderr.toString()).toBe("");
		expect(result.status).toBe(exitCode);
		expect(result.stdout.toString()).not.toContain("fake-test-key");
		const marker = await readFile(
			join(dir, ".superset-api-billing"),
			"utf8",
		).catch(() => null);
		expect(marker).toBe(exitCode === 0 ? "codex" : null);
	});
