import { expect, test } from "bun:test";
import { join } from "node:path";

test("RSC translations stay with their request across suspended concurrent locales", async () => {
	const child = Bun.spawn(
		[
			process.execPath,
			"--conditions=react-server",
			join(
				import.meta.dir,
				"_test-utils/serverI18nScenario/serverI18nScenario.ts",
			),
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
	expect(stdout).toContain("Concurrent RSC locales remained isolated.");
});
