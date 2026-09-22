import { afterEach, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
// biome-ignore lint/style/noRestrictedImports: shell integration test uses a temporary directory
import { tmpdir } from "node:os";
// biome-ignore lint/style/noRestrictedImports: shell integration test uses filesystem paths
import { join } from "node:path";
import { apiBillingLoginCommand } from "./apiBilling";

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
		const result = Bun.spawn(["/bin/bash", "-c", command], {
			env: { HOME: dir, PATH: `${dir}:/usr/bin:/bin` },
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
		result.stdin.write("fake-test-key\n");
		result.stdin.end();
		expect(await new Response(result.stderr).text()).toBe("");
		expect(await result.exited).toBe(exitCode);
		expect(await new Response(result.stdout).text()).not.toContain(
			"fake-test-key",
		);
		const marker = await readFile(
			join(dir, ".superset-api-billing"),
			"utf8",
		).catch(() => null);
		expect(marker).toBe(exitCode === 0 ? "codex" : null);
	});
