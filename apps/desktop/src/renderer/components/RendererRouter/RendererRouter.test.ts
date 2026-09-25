import { expect, test } from "bun:test";

test("root failures retain real translation context and report the original error", () => {
	const result = Bun.spawnSync({
		cmd: [process.execPath, `${import.meta.dir}/fixtures/route-errors.tsx`],
		env: { ...process.env, NODE_ENV: "test" },
	});
	expect(result.exitCode, result.stderr.toString()).toBe(0);
	expect(result.stdout.toString().trim()).toBe("passed");
});
