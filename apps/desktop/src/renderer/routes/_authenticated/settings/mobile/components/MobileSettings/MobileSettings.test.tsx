import { expect, test } from "bun:test";

test("mobile settings gates with isolated module mocks", () => {
	const result = Bun.spawnSync({
		cmd: [process.execPath, "test", `${import.meta.dir}/fixtures/checks.tsx`],
		env: { ...process.env, NODE_ENV: "test" },
	});
	expect(
		result.exitCode,
		result.stdout.toString() + result.stderr.toString(),
	).toBe(0);
});
