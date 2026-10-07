import { createHash } from "node:crypto";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.TEST_SANDBOX_MIRROR === "1") {
	const { afterAll, beforeEach, expect, mock, spyOn, test } = await import(
		"bun:test"
	);
	const packageRoot = join(import.meta.dir, "..");
	const roots: string[] = [];
	let requests: { url: string; method: string }[] = [];
	let clients = 0;
	let missing = false;
	let logins = 0;
	let imageContracts: string[] = [];
	let imageDockerfiles: string[] = [];
	const hash = (bytes: Uint8Array | string) =>
		createHash("sha256").update(bytes).digest("hex");
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Unowned fetch forbidden");
		},
		{ preconnect: () => {} },
	);
	const socket = spyOn(Socket.prototype, "connect").mockImplementation(() => {
		throw Error("Unowned socket forbidden");
	});
	mock.module("aws4fetch", () => ({
		AwsClient: class {
			constructor() {
				clients++;
			}
			async fetch(url: string, init: RequestInit) {
				requests.push({ url, method: init.method ?? "GET" });
				return new Response(null, {
					status: init.method === "HEAD" && missing ? 404 : 200,
				});
			}
		},
	}));
	const native = spyOn(Bun, "spawnSync").mockImplementation((args) => {
		const cmd = Array.isArray(args) ? args : args.cmd;
		if (cmd[0] !== "docker" || cmd[1] !== "buildx")
			throw Error("Unowned native command forbidden");
		const context = cmd.at(-1);
		if (typeof context !== "string") throw Error("Missing owned image context");
		imageContracts.push(
			readFileSync(
				join(context, "bundle/rootfs/etc/superset/contract.sh"),
				"utf8",
			),
		);
		imageDockerfiles.push(readFileSync(join(context, "Dockerfile"), "utf8"));
		return {
			pid: 0,
			exitCode: 0,
			stdout: Buffer.alloc(0),
			stderr: Buffer.alloc(0),
			success: true,
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
	async function fixture(cdnURL?: string) {
		const repo = mkdtempSync(join(tmpdir(), "superset-mirror-"));
		roots.push(repo);
		const root = join(repo, "packages/sandbox");
		mkdirSync(join(root, "src"), { recursive: true });
		symlinkSync(
			join(packageRoot, "node_modules"),
			join(root, "node_modules"),
			"dir",
		);
		cpSync(join(packageRoot, "../../.bun-version"), join(repo, ".bun-version"));
		for (const name of [
			"build.ts",
			"bucket.ts",
			"manifest.ts",
			"tarball.ts",
			"image.ts",
			"registry.ts",
		]) {
			const source = readFileSync(join(packageRoot, "src", name));
			writeFileSync(join(root, "src", name), source);
			expect(readFileSync(join(root, "src", name))).toEqual(source);
		}
		mkdirSync(join(root, "bundle/rootfs/usr/local/share/superset"), {
			recursive: true,
		});
		mkdirSync(join(root, "bundle/steps"));
		cpSync(join(packageRoot, "bundle/setup"), join(root, "bundle/setup"));
		for (const name of ["base", "toolchain", "desktop"])
			writeFileSync(
				join(root, "bundle/rootfs/usr/local/share/superset", `${name}.Aptfile`),
				"owned-package\n",
			);
		const bytes = Buffer.from("OWNED_ASSET_BYTES");
		const assetHash = hash(bytes);
		writeFileSync(
			join(root, "bundle/assets.json"),
			JSON.stringify({
				tool: {
					sha256: assetHash,
					suffix: "",
					dest: "/opt/mirror-check/tool",
					mode: "0755",
				},
			}),
		);
		writeFileSync(join(root, "bundle/steps.json"), "[]");
		mkdirSync(join(root, ".cache/assets"), { recursive: true });
		writeFileSync(join(root, ".cache/assets", assetHash), bytes);
		mkdirSync(join(root, "dist"));
		writeFileSync(join(root, "dist/retained"), "RETAINED_DIST");
		for (const [key, value] of Object.entries({
			CDN_R2_ACCESS_KEY_ID: "OWNED_FAKE_KEY",
			CDN_R2_SECRET_ACCESS_KEY: "OWNED_FAKE_SECRET",
			CDN_R2_ENDPOINT: "https://r2.example.test",
			CDN_R2_BUCKET: "owned-bucket",
		}))
			process.env[key] = value;
		if (cdnURL === undefined) delete process.env.CDN_URL;
		else process.env.CDN_URL = cdnURL;
		mock.module(join(root, "src/registry.ts"), () => ({
			loginToRegistry: async () => {
				logins++;
				return "owned.example.test/project";
			},
		}));
		const build = await import(join(root, "src/build.ts"));
		const bucket = await import(join(root, "src/bucket.ts"));
		const image = await import(join(root, "src/image.ts"));
		return { root, build, bucket, image, assetHash };
	}
	beforeEach(() => {
		requests = [];
		clients = 0;
		missing = false;
		logins = 0;
		imageContracts = [];
		imageDockerfiles = [];
	});
	afterAll(() => {
		socket.mockRestore();
		native.mockRestore();
		for (const root of roots) rmSync(root, { recursive: true, force: true });
	});
	test("default completed artifact preserves the canonical stock archive and Dockerfile", async () => {
		const f = await fixture();
		const built = f.build.buildBundle();
		expect(
			hash(readFileSync(join(built.dir, "rootfs/etc/superset/contract.sh"))),
		).toBe("42b33e9b68eb145e0d4bf462a84159d9d5a6aa34fb49e8012626b9101867be97");
		expect(built.sha256).toBe(
			"9504fe01729f9595ab9a0be7b309272278ea0534bda6fb1f771f6217d86c17f7",
		);
		expect(hash(f.image.dockerfile(built))).toBe(
			"ac1a320c56c02605d9a0b8070d7fc3854a86a3ad2076e5f6f87f0bb5aace284b",
		);
		await f.image.buildImage(built, { local: true });
		expect(imageDockerfiles).toEqual([f.image.dockerfile(built)]);
		expect(built.assetBaseURL).toBe("https://cdn.superset.sh/sandbox");
	});
	test("the same bundle has identical archive bytes for Linux and macOS gzip headers", async () => {
		const gzip = Bun.gzipSync.bind(Bun);
		let os = 3;
		const platform = spyOn(Bun, "gzipSync").mockImplementation(
			(input, options) => {
				const bytes = gzip(input, options);
				bytes[9] = os;
				return bytes;
			},
		);
		try {
			const linux = (await fixture()).build.buildBundle();
			const linuxBytes = readFileSync(linux.tarball);
			os = 19;
			const mac = (await fixture()).build.buildBundle();
			const macBytes = readFileSync(mac.tarball);
			expect(Bun.gunzipSync(linuxBytes)).toEqual(Bun.gunzipSync(macBytes));
			expect(mac.sha256).toBe(linux.sha256);
			expect(macBytes).toEqual(linuxBytes);
		} finally {
			platform.mockRestore();
		}
	});
	test("canonical selected mirror controls actual bundle and inherited image contract", async () => {
		const f = await fixture("HTTPS://Mirror.Example.TEST:443/assets/");
		const built = f.build.buildBundle();
		const contract = readFileSync(
			join(built.dir, "rootfs/etc/superset/contract.sh"),
			"utf8",
		);
		expect(contract).toContain(
			"SUPERSET_ASSET_BASE_URL='https://mirror.example.test/assets/sandbox'\n",
		);
		expect(hash(readFileSync(built.tarball))).toBe(built.sha256);
		expect(f.bucket.bucketFromEnv().url(f.assetHash)).toBe(
			`https://mirror.example.test/assets/sandbox/${f.assetHash}`,
		);
		process.env.CDN_URL = "https://later.example.test";
		await f.image.buildImage(built, { local: true });
		expect(imageContracts).toEqual([contract]);
		expect(imageDockerfiles).toEqual([f.image.dockerfile(built)]);
		expect(logins).toBe(0);
	});
	test("canonical inputs preserve bytes in separate build trees and distinct mirrors change the hash", async () => {
		const a = await fixture("https://mirror.example.test/assets");
		const first = a.build.buildBundle();
		const bytes = readFileSync(first.tarball);
		const b = await fixture("HTTPS://MIRROR.EXAMPLE.TEST:443/assets/");
		const same = b.build.buildBundle();
		expect(readFileSync(same.tarball)).toEqual(bytes);
		expect(same.sha256).toBe(first.sha256);
		const c = await fixture("https://other.example.test/assets");
		const other = c.build.buildBundle();
		expect(other.sha256).not.toBe(first.sha256);
		expect(readFileSync(first.tarball)).toEqual(bytes);
	});
	for (const dry of [true, false])
		test(`origin drift refuses publication before requests/marker, dry=${dry}`, async () => {
			const f = await fixture("https://first.example.test/prefix");
			const built = f.build.buildBundle();
			const bytes = readFileSync(built.tarball);
			process.env.CDN_URL = "https://first.example.test/other";
			await expect(f.build.publishBundle(built, { dry })).rejects.toThrow(
				"Sandbox CDN differs from built bundle",
			);
			expect(requests).toEqual([]);
			expect(existsSync(join(f.root, "dist/last-published.json"))).toBe(false);
			expect(readFileSync(built.tarball)).toEqual(bytes);
		});
	for (const input of [
		"https://user:OWNED_TOKEN@mirror.example.test",
		"https://mirror.example.test/../prefix",
		"https://mirror.example.test?token=OWNED_TOKEN",
	])
		test(`malformed base refuses build and bucket before writes/network ${JSON.stringify(input)}`, async () => {
			const f = await fixture(input);
			expect(() => f.build.buildBundle()).toThrow("Invalid sandbox CDN URL");
			expect(readFileSync(join(f.root, "dist/retained"), "utf8")).toBe(
				"RETAINED_DIST",
			);
			expect(existsSync(join(f.root, "dist/staging"))).toBe(false);
			expect(() => f.bucket.bucketFromEnv()).toThrow("Invalid sandbox CDN URL");
			expect(clients).toBe(0);
			expect(requests).toEqual([]);
		});
	test("publisher keeps mandatory CDN and credential guard", async () => {
		const f = await fixture();
		expect(() => f.bucket.bucketFromEnv()).toThrow(
			"bucket credentials missing: CDN_URL",
		);
		expect(clients).toBe(0);
		expect(requests).toEqual([]);
	});
	test("same intact selected artifact publishes assets before bundle to aligned public base", async () => {
		const f = await fixture("https://mirror.example.test/assets/");
		const built = f.build.buildBundle();
		missing = true;
		await f.build.publishBundle(built, { dry: false });
		expect(requests.map((r) => [r.method, r.url])).toEqual([
			["HEAD", `https://r2.example.test/owned-bucket/sandbox/${f.assetHash}`],
			[
				"HEAD",
				`https://r2.example.test/owned-bucket/sandbox/${built.sha256}.tar.gz`,
			],
			["PUT", `https://r2.example.test/owned-bucket/sandbox/${f.assetHash}`],
			[
				"PUT",
				`https://r2.example.test/owned-bucket/sandbox/${built.sha256}.tar.gz`,
			],
		]);
		expect(
			JSON.parse(readFileSync(join(f.root, "dist/last-published.json"), "utf8"))
				.sha256,
		).toBe(built.sha256);
		expect(hash(readFileSync(built.tarball))).toBe(built.sha256);
	});
} else {
	const { expect, test } = await import("bun:test");
	test("mirror actual callers use a cleared isolated child", () => {
		const child = Bun.spawnSync(
			[process.execPath, "--no-env-file", "test", import.meta.path],
			{
				env: {
					PATH: process.env.PATH,
					TMPDIR: "/tmp",
					TEST_SANDBOX_MIRROR: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
				timeout: 20000,
			},
		);
		if (child.exitCode !== 0)
			console.error(new TextDecoder().decode(child.stderr));
		expect(child.exitCode).toBe(0);
	}, 30000);
}
