import { afterAll, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLIError } from "@superset/cli-framework";

const home = mkdtempSync(join(tmpdir(), "superset-cdp-registry-"));
const previousHome = process.env.SUPERSET_HOME_DIR;
process.env.SUPERSET_HOME_DIR = home;
const {
	proxyDirectory,
	tryProxyLock,
	readProxy,
	writeProxy,
	proxyProcessIsAlive,
} = await import("./registry");
const { cdpProxyId, ensureCdpProxy, stopCdpProxy } = await import("./client");
const { env } = await import("../env");
mkdirSync(proxyDirectory, { recursive: true, mode: 0o700 });
const options = {
	apiKey: ["sk", "test", "registry", "fixture"].join("_"),
	organizationId: "org",
	hostId: "host",
	workspaceId: "workspace",
	paneId: "pane",
	upstreamUrl: "ws://127.0.0.1:1/cdp?workspaceId=workspace",
};

afterAll(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(home, { recursive: true, force: true });
	expect(process.env.SUPERSET_HOME_DIR).toBe(previousHome);
});

test.each([
	"ensure",
	"stop",
])("%s recovers a refused endpoint with unknown recycled-PID identity", async (action) => {
	const endpoint = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Response(),
	});
	const manifest = {
		id: cdpProxyId(options),
		pid: process.pid,
		instance: "d".repeat(64),
		endpoint: endpoint.url.origin,
		token: "b".repeat(64),
		stopToken: "c".repeat(64),
	};
	endpoint.stop(true);
	writeProxy(manifest);
	const previousPath = process.env.PATH;
	process.env.PATH = home;
	try {
		if (action === "ensure") {
			const proxy = await ensureCdpProxy(options);
			expect(readProxy(proxy.proxyId)?.pid).not.toBe(process.pid);
		} else {
			expect(await stopCdpProxy(manifest.id)).toBe(true);
			expect(readProxy(manifest.id)).toBeNull();
		}
		expect(() => process.kill(process.pid, 0)).not.toThrow();
	} finally {
		if (previousPath === undefined) delete process.env.PATH;
		else process.env.PATH = previousPath;
		await stopCdpProxy(manifest.id);
	}
});

test("uncertain transport failures keep the manifest and produce a controlled stop error", async () => {
	const endpoint = createServer((socket) => socket.destroy());
	await new Promise<void>((resolve) =>
		endpoint.listen(0, "127.0.0.1", resolve),
	);
	const address = endpoint.address();
	if (!address || typeof address === "string")
		throw new Error("Missing TCP address");
	const manifest = {
		id: cdpProxyId(options),
		pid: process.pid,
		instance: "d".repeat(64),
		endpoint: `http://127.0.0.1:${address.port}`,
		token: "b".repeat(64),
		stopToken: "c".repeat(64),
	};
	writeProxy(manifest);
	const previousPath = process.env.PATH;
	process.env.PATH = home;
	try {
		await expect(ensureCdpProxy(options)).rejects.toBeInstanceOf(CLIError);
		await expect(stopCdpProxy(manifest.id)).rejects.toBeInstanceOf(CLIError);
		expect(readProxy(manifest.id)).toEqual(manifest);
	} finally {
		if (previousPath === undefined) delete process.env.PATH;
		else process.env.PATH = previousPath;
		endpoint.close();
		await stopCdpProxy(manifest.id);
	}
});

test("an authenticated stop can confirm closure when PID inspection is unavailable", async () => {
	const endpoint = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request) {
			expect(request.headers.get("Authorization")).toBe(
				`Bearer ${"c".repeat(64)}`,
			);
			if (new URL(request.url).pathname === "/health")
				return Response.json({ id: cdpProxyId(options), pid: process.pid });
			setTimeout(() => endpoint.stop(true), 0);
			return Response.json({ stopping: true });
		},
	});
	const manifest = {
		id: cdpProxyId(options),
		pid: process.pid,
		instance: "d".repeat(64),
		endpoint: endpoint.url.origin,
		token: "b".repeat(64),
		stopToken: "c".repeat(64),
	};
	writeProxy(manifest);
	const previousPath = process.env.PATH;
	process.env.PATH = home;
	try {
		expect(await stopCdpProxy(manifest.id)).toBe(true);
		expect(readProxy(manifest.id)).toBeNull();
	} finally {
		if (previousPath === undefined) delete process.env.PATH;
		else process.env.PATH = previousPath;
		endpoint.stop(true);
		await stopCdpProxy(manifest.id);
	}
});

test("unknown ownership never sends a stop request to a foreign local server", async () => {
	let stopRequests = 0;
	const endpoint = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request) {
			if (new URL(request.url).pathname === "/stop") stopRequests++;
			return Response.json({ id: "foreign", pid: process.pid });
		},
	});
	const manifest = {
		id: cdpProxyId(options),
		pid: process.pid,
		instance: "d".repeat(64),
		endpoint: endpoint.url.origin,
		token: "b".repeat(64),
		stopToken: "c".repeat(64),
	};
	writeProxy(manifest);
	const previousPath = process.env.PATH;
	process.env.PATH = home;
	try {
		await expect(stopCdpProxy(manifest.id)).rejects.toBeInstanceOf(CLIError);
		expect(stopRequests).toBe(0);
		expect(readProxy(manifest.id)).toEqual(manifest);
	} finally {
		if (previousPath === undefined) delete process.env.PATH;
		else process.env.PATH = previousPath;
		endpoint.stop(true);
		await stopCdpProxy(manifest.id);
	}
});

test("a crashed lock owner releases the startup transaction", async () => {
	const child = Bun.spawn(
		[process.execPath, join(import.meta.dir, "fixtures/lock.ts")],
		{
			env: { ...process.env, SUPERSET_HOME_DIR: home },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	try {
		await child.stdout.getReader().read();
		expect(tryProxyLock("a".repeat(64))).toBeNull();
		child.kill("SIGKILL");
		await child.exited;
		const release = tryProxyLock("a".repeat(64));
		expect(release).not.toBeNull();
		release?.();
		expect(
			statSync(join(proxyDirectory, "launch-lock.sqlite")).mode & 0o777,
		).toBe(0o600);
	} finally {
		if (child.exitCode === null) child.kill("SIGKILL");
		await child.exited;
	}
});

test("reuse identity isolates credentials, target routes and path-mounted API environments", () => {
	const original = env.SUPERSET_API_URL;
	try {
		env.SUPERSET_API_URL = "https://example.com/one/";
		const id = cdpProxyId(options);
		env.SUPERSET_API_URL = "https://example.com/one";
		expect(cdpProxyId(options)).toBe(id);
		env.SUPERSET_API_URL = "https://example.com/two";
		expect(cdpProxyId(options)).not.toBe(id);
		env.SUPERSET_API_URL = "https://example.com/one";
		for (const key of [
			"apiKey",
			"organizationId",
			"hostId",
			"workspaceId",
			"paneId",
			"upstreamUrl",
		] as const) {
			expect(
				cdpProxyId({ ...options, [key]: `${options[key]}other` }),
			).not.toBe(id);
		}
	} finally {
		env.SUPERSET_API_URL = original;
	}
});

test("concurrent exports reuse one daemon and uncertain health retains its management handle", async () => {
	const [first, second] = await Promise.all([
		ensureCdpProxy(options),
		ensureCdpProxy(options),
	]);
	const manifest = readProxy(first.proxyId)!;
	try {
		expect(first).toEqual(second);
		expect(await proxyProcessIsAlive(manifest)).toBe(true);
		expect(
			statSync(join(proxyDirectory, `${manifest.id}.json`)).mode & 0o777,
		).toBe(0o600);
		writeProxy({ ...manifest, stopToken: "e".repeat(64) });
		await expect(ensureCdpProxy(options)).rejects.toThrow("not responding");
		await expect(stopCdpProxy(manifest.id)).rejects.toThrow("Could not stop");
		expect(readProxy(manifest.id)?.pid).toBe(manifest.pid);
		const closedEndpoint = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: () => new Response(),
		});
		const refusedManifest = {
			...manifest,
			endpoint: closedEndpoint.url.origin,
		};
		closedEndpoint.stop(true);
		writeProxy(refusedManifest);
		await expect(ensureCdpProxy(options)).rejects.toThrow("not responding");
		await expect(stopCdpProxy(manifest.id)).rejects.toBeInstanceOf(CLIError);
		expect(readProxy(manifest.id)).toEqual(refusedManifest);
		writeProxy(manifest);
		expect(
			readFileSync(join(proxyDirectory, `${manifest.id}.json`), "utf8"),
		).not.toContain(options.apiKey);
	} finally {
		writeProxy(manifest);
		await stopCdpProxy(manifest.id);
	}
	expect(await proxyProcessIsAlive(manifest)).toBe(false);
	expect(readProxy(manifest.id)).toBeNull();
});

test("manifest identity is bound to its filename and stale PIDs cannot stop unrelated processes", async () => {
	const id = cdpProxyId(options);
	const manifest = {
		id,
		pid: process.pid,
		instance: "d".repeat(64),
		endpoint: "http://127.0.0.1:1",
		token: "b".repeat(64),
		stopToken: "c".repeat(64),
	};
	writeProxy(manifest);
	expect(await proxyProcessIsAlive(manifest)).toBe(false);
	expect(await stopCdpProxy(id)).toBe(true);
	writeFileSync(
		join(proxyDirectory, `${id}.json`),
		JSON.stringify({ ...manifest, id: "e".repeat(64) }),
	);
	expect(readProxy(id)).toBeNull();
});
