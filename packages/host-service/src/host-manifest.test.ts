import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	claimManifest,
	type HostServiceManifest,
	readManifest,
} from "./host-manifest";

const ORG = "org_manifest_test";

let tempHome: string;
const originalHome = process.env.SUPERSET_HOME_DIR;

beforeAll(() => {
	tempHome = mkdtempSync(join(tmpdir(), "superset-host-manifest-"));
	process.env.SUPERSET_HOME_DIR = tempHome;
});

afterEach(() => {
	rmSync(join(tempHome, "host"), { recursive: true, force: true });
});

afterAll(() => {
	rmSync(tempHome, { recursive: true, force: true });
	if (originalHome === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalHome;
	}
});

function manifestFor(pid: number, endpoint: string): HostServiceManifest {
	return {
		pid,
		endpoint,
		authToken: "secret",
		startedAt: Date.now(),
		organizationId: ORG,
	};
}

async function withHealthyHost<Result>(
	run: (endpoint: string) => Promise<Result>,
): Promise<Result> {
	const server: Server = createServer((req, res) => {
		if (req.url?.startsWith("/trpc/health.check")) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ status: "ok" }));
			return;
		}
		res.writeHead(404).end();
	});
	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve());
	});
	try {
		const { port } = server.address() as AddressInfo;
		return await run(`http://127.0.0.1:${port}`);
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	}
}

describe("claimManifest", () => {
	it("claims when no manifest exists", async () => {
		const manifest = manifestFor(process.pid, "http://127.0.0.1:1234");
		await claimManifest(manifest);
		expect(readManifest(ORG)).toEqual(manifest);
	});

	it("steals the claim from a dead holder", async () => {
		const dead = manifestFor(999_999_999, "http://127.0.0.1:1");
		await claimManifest(dead);
		const ours = manifestFor(process.pid, "http://127.0.0.1:1234");
		await claimManifest(ours);
		expect(readManifest(ORG)?.pid).toBe(process.pid);
	});

	it("yields to a live, healthy holder", async () => {
		await withHealthyHost(async (endpoint) => {
			// ppid is a live process that isn't us — the health probe against the
			// fake server is what makes it a valid holder.
			const holder = manifestFor(process.ppid, endpoint);
			await claimManifest(holder);
			const ours = manifestFor(process.pid, "http://127.0.0.1:1234");
			await claimManifest(ours);
			expect(readManifest(ORG)?.pid).toBe(process.ppid);
		});
	});

	it("readManifest rejects malformed files", async () => {
		const manifest = manifestFor(process.pid, "http://127.0.0.1:1234");
		await claimManifest(manifest);
		const filePath = join(tempHome, "host", ORG, "manifest.json");
		expect(readFileSync(filePath, "utf-8")).toContain(String(process.pid));
		await Bun.write(filePath, '{"pid": "not-a-number"}');
		expect(readManifest(ORG)).toBeNull();
	});
});
