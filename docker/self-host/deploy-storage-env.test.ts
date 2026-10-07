import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

for (const workflow of ["deploy-preview", "deploy-production"]) {
	test(`${workflow} forwards full storage assignments without splitting or globbing`, () => {
		const source = readFileSync(
			resolve(import.meta.dir, `../../.github/workflows/${workflow}.yml`),
			"utf8",
		);
		const argumentsText = source
			.split("\n")
			.filter((line) => /--env.*S3_/.test(line))
			.map((line) => line.trim().replace(/\\$/, ""))
			.join(" ");
		const keys = [...source.matchAll(/--env.*?(S3_[A-Z_]+)=\$/g)].map(
			(match) => match[1],
		);
		const env = Object.fromEntries(
			keys.map((key) => [key, "owned space * [abc] value"]),
		);
		const root = mkdtempSync("/tmp/superset-env-argv-");
		try {
			const result = Bun.spawnSync(
				["/bin/bash", "-c", `printf '%s\\0' ${argumentsText}`],
				{ cwd: root, env, stdout: "pipe", stderr: "pipe", timeout: 5000 },
			);
			expect(result.exitCode).toBe(0);
			expect(result.stderr.toString()).toBe("");
			expect(result.stdout.toString().split("\0").slice(0, -1)).toEqual(
				keys.flatMap((key) => ["--env", `${key}=${env[key]}`]),
			);
			expect(keys).toHaveLength(8);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
}
