import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("stopping the detached worker aborts a stalled token exchange", async () => {
	let started: () => void = () => {};
	const requested = new Promise<void>((resolve) => {
		started = resolve;
	});
	const api = Bun.serve({
		port: 0,
		fetch() {
			started();
			return new Promise<Response>(() => {});
		},
	});
	const home = mkdtempSync(join(tmpdir(), "superset-cdp-stop-"));
	const child = Bun.spawn(
		[
			process.execPath,
			join(import.meta.dir, "worker-main.ts"),
			"--instance",
			"a".repeat(64),
		],
		{
			env: {
				...process.env,
				SUPERSET_HOME_DIR: home,
				SUPERSET_API_URL: api.url.origin,
			},
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	try {
		child.stdin.write(
			`${JSON.stringify({ id: "b".repeat(64), apiKey: ["sk", "test", "fixture"].join("_"), upstreamUrl: "ws://127.0.0.1:1/cdp" })}\n`,
		);
		const reader = child.stdout.getReader();
		const { value } = await reader.read();
		const manifest = JSON.parse(new TextDecoder().decode(value));
		child.stdin.write("ready\n");
		child.stdin.end();
		const ws = new WebSocket(
			`${manifest.endpoint.replace("http", "ws")}/cdp?token=${manifest.token}`,
		);
		try {
			await requested;
			const response = await fetch(`${manifest.endpoint}/stop`, {
				method: "POST",
				headers: { Authorization: `Bearer ${manifest.stopToken}` },
			});
			expect(response.status).toBe(200);
			expect(
				await Promise.race([
					child.exited,
					Bun.sleep(500).then(() => "still running"),
				]),
			).toBe(0);
			await expect(fetch(`${manifest.endpoint}/health`)).rejects.toThrow();
		} finally {
			ws.close();
		}
	} finally {
		if (child.exitCode === null) child.kill("SIGKILL");
		await child.exited;
		api.stop(true);
		rmSync(home, { recursive: true, force: true });
	}
});

test("a worker exits without a manifest when its launcher disappears before acknowledgement", async () => {
	const home = mkdtempSync(join(tmpdir(), "superset-cdp-startup-"));
	const child = Bun.spawn(
		[
			process.execPath,
			join(import.meta.dir, "worker-main.ts"),
			"--instance",
			"a".repeat(64),
		],
		{
			env: { ...process.env, SUPERSET_HOME_DIR: home },
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	try {
		child.stdin.write(
			`${JSON.stringify({ id: "b".repeat(64), apiKey: ["sk", "test", "fixture"].join("_"), upstreamUrl: "ws://127.0.0.1:1/cdp" })}\n`,
		);
		const { value } = await child.stdout.getReader().read();
		const manifest = JSON.parse(new TextDecoder().decode(value));
		child.stdin.end();
		expect(await child.exited).toBe(0);
		await expect(fetch(`${manifest.endpoint}/health`)).rejects.toThrow();
		expect(
			readdirSync(join(home, "cdp-proxies")).filter((name) =>
				name.endsWith(".json"),
			),
		).toHaveLength(0);
	} finally {
		if (child.exitCode === null) child.kill("SIGKILL");
		await child.exited;
		rmSync(home, { recursive: true, force: true });
	}
});
