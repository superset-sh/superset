import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("native Node TLS streams retain binary bounds, backpressure and cancellation", async () => {
	const directory = mkdtempSync(
		join(tmpdir(), "superset-owned-node-stream-tests-"),
	);
	try {
		const output = join(directory, "proof.mjs");
		const built = await Bun.build({
			entrypoints: [
				join(import.meta.dir, "stream-transport.fixture.integration.ts"),
			],
			target: "node",
			outdir: directory,
			naming: "proof.mjs",
		});
		expect(built.success).toBe(true);
		const child = Bun.spawn(["node", "--test", output], {
			env: { PATH: process.env.PATH ?? "", TMPDIR: directory },
			stdout: "pipe",
			stderr: "pipe",
		});
		const deadline = setTimeout(() => child.kill("SIGKILL"), 25_000);
		try {
			const [stdout, stderr, code] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			expect(code, `${stdout}\n${stderr}`).toBe(0);
		} finally {
			clearTimeout(deadline);
			child.kill();
			await child.exited;
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}, 30_000);
