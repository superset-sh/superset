import { describe, expect, test } from "bun:test";

describe("Linear mirror retirement result portability", () => {
	for (const shape of ["neon", "postgres"] as const) {
		for (const apply of [false, true]) {
			test(`${shape}: ${apply ? "apply retains referenced tasks and counts deletion" : "dry run never writes"}`, () => {
				const result = Bun.spawnSync({
					cmd: [
						process.execPath,
						"--no-env-file",
						new URL("./prune-linear-mirror.fixture.ts", import.meta.url)
							.pathname,
					],
					env: {
						PATH: process.env.PATH,
						PRUNE_FIXTURE_SHAPE: shape,
						PRUNE_FIXTURE_APPLY: apply ? "1" : "0",
					},
					stdout: "pipe",
					stderr: "pipe",
					timeout: 5000,
				});
				expect(result.stderr.toString()).toBe("");
				expect(result.exitCode).toBe(0);
				const proof = JSON.parse(result.stdout.toString());
				expect(proof).toMatchObject({ shape, apply, writes: apply ? 8 : 0 });
			});
		}
	}
});
