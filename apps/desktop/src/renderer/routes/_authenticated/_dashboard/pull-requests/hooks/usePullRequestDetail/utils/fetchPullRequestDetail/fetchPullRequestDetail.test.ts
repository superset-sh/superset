import { expect, test } from "bun:test";

test("summary routing with isolated module mocks", () => {
	const result = Bun.spawnSync({
		cmd: [process.execPath, "test", `${import.meta.dir}/fixtures/checks.ts`],
		env: { ...process.env, NODE_ENV: "test" },
	});
	expect(
		result.exitCode,
		result.stdout.toString() + result.stderr.toString(),
	).toBe(0);
});
