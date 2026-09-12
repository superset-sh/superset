import { expect, test } from "bun:test";

test("auth imports in a fresh Bun process", async () => {
	const authUrl = new URL("./index.ts", import.meta.url).href;
	const childProcess = Bun.spawn({
		cmd: [
			process.execPath,
			"--eval",
			`await import(${JSON.stringify(authUrl)})`,
		],
		stderr: "pipe",
	});

	const [exitCode, stderr] = await Promise.all([
		childProcess.exited,
		new Response(childProcess.stderr).text(),
	]);

	expect(exitCode, stderr).toBe(0);
});
