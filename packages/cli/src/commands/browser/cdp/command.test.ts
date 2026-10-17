import { afterEach, expect, test } from "bun:test";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const homes: string[] = [];
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
	for (const stop of stops.splice(0)) await stop();
	for (const home of homes.splice(0))
		rmSync(home, { recursive: true, force: true });
});

const launchers = [
	{
		name: "source",
		argv: [
			process.execPath,
			"run",
			join(import.meta.dir, "fixtures/export.ts"),
		],
		direct: true,
	},
	{
		name: "dev",
		argv: [
			process.execPath,
			join(import.meta.dir, "../../../../../cli-framework/src/bin.ts"),
			"dev",
		],
		direct: false,
	},
	...(process.env.CDP_TEST_BINARY
		? [{ name: "compiled", argv: [process.env.CDP_TEST_BINARY], direct: false }]
		: []),
];

test.each(
	launchers,
)("$name exported CDP URL survives CLI exit and the original JWT expiry", async (launcher) => {
	let clock = Math.floor(Date.now() / 1000);
	const originalClock = clock;
	let exchanges = 0;
	const server = Bun.serve({
		port: 0,
		fetch(request, server) {
			const url = new URL(request.url);
			if (url.pathname === "/api/auth/token") {
				exchanges++;
				return Response.json({
					token: `header.${Buffer.from(JSON.stringify({ exp: clock + 3600 })).toString("base64url")}.signature`,
				});
			}
			if (url.pathname === "/api/trpc/host.relayEndpoint")
				return Response.json([
					{ result: { data: { json: { url: server.url.origin } } } },
				]);
			if (url.pathname.endsWith("/trpc/browser.list"))
				return Response.json([
					{
						result: { data: { json: { panes: [{ paneId: "pane-fixture" }] } } },
					},
				]);
			if (url.pathname.endsWith("/cdp")) {
				const token = url.searchParams.get("token") ?? "";
				const payload = JSON.parse(
					Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
				);
				if (payload.exp <= clock) return new Response(null, { status: 401 });
				if (server.upgrade(request)) return;
			}
			return new Response(null, { status: 404 });
		},
		websocket: {
			message(ws, message) {
				ws.send(message);
			},
		},
	});
	stops.push(async () => {
		server.stop(true);
	});
	const home = mkdtempSync(join(tmpdir(), "superset-cdp-export-"));
	homes.push(home);
	const child = Bun.spawn(
		[
			...launcher.argv,
			...(launcher.direct
				? []
				: [
						"browser",
						"cdp",
						"--host",
						"remote-fixture",
						"--workspace",
						"workspace-fixture",
						"--pane",
						"pane-fixture",
						"--json",
					]),
		],
		{
			cwd: join(import.meta.dir, "../../../.."),
			env: {
				...process.env,
				SUPERSET_HOME_DIR: home,
				SUPERSET_API_URL: server.url.origin,
				SUPERSET_API_KEY: ["sk", "test", "cdp", "fixture"].join("_"),
				SUPERSET_ORGANIZATION_ID: "org-fixture",
			},
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const output = await new Response(child.stdout).text();
	expect(await child.exited).toBe(0);
	const parsed = JSON.parse(output);
	const result = (launcher.direct ? parsed : { data: parsed }) as {
		data: { url: string; proxyId?: string };
	};
	if (result.data.proxyId) {
		const manifestPath = join(
			home,
			"cdp-proxies",
			`${result.data.proxyId}.json`,
		);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
		stops.unshift(async () => {
			const stop = Bun.spawn(
				[
					process.execPath,
					"run",
					join(import.meta.dir, "fixtures/stop.ts"),
					manifest.id,
				],
				{
					env: {
						...process.env,
						SUPERSET_HOME_DIR: home,
						SUPERSET_API_KEY: undefined,
					},
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			expect(await stop.exited).toBe(0);
			await expect(fetch(`${manifest.endpoint}/health`)).rejects.toThrow();
		});
		const warning = await new Response(child.stderr).text();
		if (launcher.direct) expect(parsed.message).toBe(result.data.url);
		expect(warning).toContain("Treat it as a secret");
		expect(warning).toContain(`superset browser cdp-stop --id ${manifest.id}`);
		expect(warning).not.toContain(manifest.token);
		expect(warning).not.toContain(result.data.url);
		expect(warning).not.toContain(["sk", "test", "cdp", "fixture"].join("_"));
		expect(statSync(manifestPath).mode & 0o777).toBe(0o600);
		expect(readFileSync(manifestPath, "utf8")).not.toContain(
			["sk", "test", "cdp", "fixture"].join("_"),
		);
	}
	clock = originalClock + 3601;
	const ws = new WebSocket(result.data.url);
	const received = await new Promise<string>((resolve, reject) => {
		ws.onopen = () => ws.send('{"id":1,"method":"Runtime.enable"}');
		ws.onmessage = (event) => {
			resolve(String(event.data));
			ws.close();
		};
		ws.onerror = () =>
			reject(
				new Error("Exported CDP URL rejected after original token expiry"),
			);
	});
	expect(received).toBe('{"id":1,"method":"Runtime.enable"}');
	expect(exchanges).toBeGreaterThan(1);
	expect(result.data.url).toStartWith("ws://127.0.0.1:");
	expect(
		readdirSync(join(home, "cdp-proxies")).filter((name) =>
			name.endsWith(".json"),
		),
	).toHaveLength(1);
});
