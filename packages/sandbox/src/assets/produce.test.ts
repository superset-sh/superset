import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.TEST_GLAB_ASSET_FIXTURE === "1") {
	const { test, expect, mock, spyOn, afterAll, beforeEach } = await import(
		"bun:test"
	);
	const root = mkdtempSync(join(tmpdir(), "superset-glab-assets-"));
	const cache = join(root, "cache");
	const bundle = join(root, "bundle");
	const assetsFile = join(bundle, "assets.json");
	mkdirSync(bundle);
	const prior = `${JSON.stringify(
		{
			legacy: {
				sha256: "a".repeat(64),
				suffix: "",
				dest: "/usr/local/bin/legacy",
				mode: "0755",
				source: "https://legacy.example/binary",
				version: "3",
			},
		},
		null,
		"\t",
	)}\n`;
	const name = "glab_1.109.0_linux_amd64.tar.gz";
	const source = `https://gitlab.com/gitlab-org/cli/-/releases/v1.109.0/downloads/${name}`;
	const checksumsURL =
		"https://gitlab.com/gitlab-org/cli/-/releases/v1.109.0/downloads/checksums.txt";
	const archive = Buffer.from("OWNED_SYNTHETIC_VERIFIED_ARCHIVE");
	const digest = createHash("sha256").update(archive).digest("hex");
	const elf = Buffer.alloc(64);
	elf.set([127, 69, 76, 70, 2, 1, 1]);
	elf.writeUInt16LE(2, 16);
	elf.writeUInt16LE(62, 18);
	elf.writeUInt32LE(1, 20);
	elf.writeUInt16LE(64, 52);
	let checksum = `${digest}  ${name}\n`;
	let servedArchive = archive;
	let extracted = elf;
	let extractExit = 0;
	let extractCalls = 0;
	let requested: string[] = [];
	let status = 200;
	const outbound = spyOn(Socket.prototype, "connect").mockImplementation(() => {
		throw new Error("Outbound connection forbidden");
	});
	globalThis.fetch = (async (input) => {
		const url = String(input);
		requested.push(url);
		if (url === checksumsURL) return new Response(checksum, { status });
		if (url === source) return new Response(servedArchive);
		throw new Error("Unowned fetch forbidden");
	}) as typeof fetch;
	mock.module(new URL("../build.ts", import.meta.url).pathname, () => ({
		ASSET_CACHE: cache,
		BUNDLE_SRC: bundle,
		PACKAGE_ROOT: root,
	}));
	const native = spyOn(Bun, "spawnSync").mockImplementation((args) => {
		const command = Array.isArray(args) ? args : args.cmd;
		expect(command[0]).toBe("tar");
		expect(command[1]).toBe("-xOzf");
		expect(command[3]).toBe("bin/glab");
		expect(command).toHaveLength(4);
		extractCalls++;
		return {
			pid: 0,
			exitCode: extractExit,
			stdout: extracted,
			stderr: Buffer.from("OWNED_TAR_ERROR"),
			success: extractExit === 0,
			resourceUsage: {
				contextSwitches: { voluntary: 0, involuntary: 0 },
				cpuTime: { user: 0, system: 0, total: 0 },
				maxRSS: 0,
				messages: { sent: 0, received: 0 },
				ops: { in: 0, out: 0 },
				shmSize: 0,
				signalCount: 0,
				swapCount: 0,
			},
		} satisfies Bun.SyncSubprocess<"pipe", "pipe">;
	});
	const { producers } = await import("./produce");
	const run = (version?: string) => producers.glab?.(version);
	beforeEach(() => {
		rmSync(cache, { recursive: true, force: true });
		writeFileSync(assetsFile, prior);
		mkdirSync(cache, { recursive: true });
		writeFileSync(join(cache, "retained-cache"), "RETAINED_CACHE_BYTES");
		checksum = `${digest}  ${name}\n`;
		servedArchive = archive;
		extracted = elf;
		extractExit = 0;
		extractCalls = 0;
		requested = [];
		status = 200;
	});
	afterAll(() => {
		native.mockRestore();
		outbound.mockRestore();
		rmSync(root, { recursive: true, force: true });
	});
	function untouched() {
		expect(readFileSync(assetsFile, "utf8")).toBe(prior);
		expect(readdirSync(cache, { recursive: true })).toEqual(["retained-cache"]);
		expect(readFileSync(join(cache, "retained-cache"), "utf8")).toBe(
			"RETAINED_CACHE_BYTES",
		);
	}
	test("generates the executable row from verified extracted bytes and preserves prior rows", async () => {
		await run();
		const rows = JSON.parse(readFileSync(assetsFile, "utf8"));
		const hash = createHash("sha256").update(elf).digest("hex");
		expect(rows.glab).toEqual({
			sha256: hash,
			suffix: "",
			dest: "/usr/local/bin/glab",
			mode: "0755",
			source,
			version: "1.109.0",
		});
		delete rows.glab;
		expect(`${JSON.stringify(rows, null, "\t")}\n`).toBe(prior);
		expect(readFileSync(join(cache, hash))).toEqual(elf);
		expect(requested).toEqual([checksumsURL, source]);
		expect(extractCalls).toBe(1);
	});
	for (const [label, value] of [
		["wrong checksum", `${"0".repeat(64)}  ${name}\n`],
		[
			"missing selected archive",
			`${digest}  glab_1.109.0_linux_arm64.tar.gz\n`,
		],
		["duplicate selected archive", `${digest}  ${name}\n${digest}  ${name}\n`],
		["malformed digest", `not-a-digest  ${name}\n`],
	] as const)
		test(`refuses ${label} before extraction or cache/manifest writes`, async () => {
			mkdirSync(cache, { recursive: true });
			checksum = value;
			await expect(run()).rejects.toThrow();
			expect(extractCalls).toBe(0);
			untouched();
		});
	test("refuses changed archive bytes before extraction or cache/manifest writes", async () => {
		mkdirSync(cache, { recursive: true });
		servedArchive = Buffer.from("TAMPERED");
		await expect(run()).rejects.toThrow();
		expect(extractCalls).toBe(0);
		untouched();
	});
	for (const [label, exit, binary] of [
		["corrupt archive", 2, Buffer.alloc(0)],
		["missing bin/glab", 1, Buffer.alloc(0)],
		["wrong ELF architecture", 0, Buffer.from(elf).fill(0, 18, 20)],
		["non-ELF binary", 0, Buffer.from("not-an-executable")],
		["truncated ELF", 0, elf.subarray(0, 20)],
	] as const)
		test(`refuses ${label} without final cache/manifest mutation`, async () => {
			mkdirSync(cache, { recursive: true });
			extractExit = exit;
			extracted = binary;
			await expect(run()).rejects.toThrow();
			untouched();
		});
	test("an unreviewed version override never fetches or mutates state", async () => {
		mkdirSync(cache, { recursive: true });
		await expect(run("1.110.0")).rejects.toThrow();
		expect(requested).toHaveLength(0);
		untouched();
	});
	test("HTTP failure cannot produce a cached executable or manifest row", async () => {
		mkdirSync(cache, { recursive: true });
		status = 503;
		await expect(run()).rejects.toThrow();
		expect(extractCalls).toBe(0);
		untouched();
	});
	test("oversized checksum body is rejected before archive extraction", async () => {
		mkdirSync(cache, { recursive: true });
		checksum = "x".repeat(262145);
		await expect(run()).rejects.toThrow();
		expect(requested).toEqual([checksumsURL]);
		expect(extractCalls).toBe(0);
		untouched();
	});
} else {
	const { test, expect } = await import("bun:test");
	test("glab producer fixtures are isolated with a cleared environment", () => {
		const child = Bun.spawnSync(
			[process.execPath, "--no-env-file", "test", import.meta.path],
			{
				env: {
					PATH: process.env.PATH,
					TMPDIR: "/tmp",
					TEST_GLAB_ASSET_FIXTURE: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		if (child.exitCode !== 0)
			console.error(new TextDecoder().decode(child.stderr));
		expect(child.exitCode).toBe(0);
	});
}
