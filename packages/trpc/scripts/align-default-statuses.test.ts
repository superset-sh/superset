import { expect, test } from "bun:test";

for (const shape of ["neon", "postgres"]) {
	for (const apply of [false, true]) {
		test(`${shape} status repair ${apply ? "writes the required changes" : "dry run only reports"}`, () => {
			const result = Bun.spawnSync({
				cmd: [
					process.execPath,
					"--no-env-file",
					new URL("./align-default-statuses.fixture.ts", import.meta.url)
						.pathname,
				],
				env: {
					PATH: process.env.PATH,
					STATUS_FIXTURE_SHAPE: shape,
					STATUS_FIXTURE_APPLY: apply ? "1" : "0",
				},
				stdout: "pipe",
				stderr: "pipe",
				timeout: 5000,
			});
			expect(result.stderr.toString()).toBe("");
			expect(result.exitCode).toBe(0);
			expect(JSON.parse(result.stdout.toString())).toEqual({
				shape,
				apply,
				writes: apply ? 3 : 0,
			});
		});
	}
}
