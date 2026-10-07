import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

function fixture(run: (f: ReturnType<typeof createFixture>) => void) {
	const root = mkdtempSync("/tmp/superset-realtime-config-");
	try {
		run(createFixture(root));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}
function createFixture(root: string) {
	const worker = join(root, "worker"),
		bin = join(root, "bin");
	mkdirSync(worker);
	mkdirSync(bin);
	for (const file of [
		"render-realtime-config.mjs",
		"realtime.capnp.in",
		"realtime-entrypoint.sh",
	])
		copyFileSync(join(import.meta.dirname, file), join(worker, file));
	const node = Bun.which("node");
	if (!node) throw new Error("Node is required for the renderer fixtures");
	const guard = join(root, "deny.cjs"),
		log = join(root, "workerd-args");
	symlinkSync(node, join(bin, "node"));
	writeFileSync(
		guard,
		`const deny=()=>{throw Error("Unexpected external operation")};globalThis.fetch=deny;require("node:net").Socket.prototype.connect=deny;const cp=require("node:child_process");for(const k of ["spawn","spawnSync","exec","execSync","execFile","execFileSync"])cp[k]=deny;const Module=require("node:module"),load=Module._load;Module._load=function(name,...args){if(name==="dotenv")return {config:deny};return load.call(this,name,...args)};`,
	);
	writeFileSync(
		join(bin, "workerd"),
		'#!/bin/sh\nprintf \'%s\\n\' "$@" > "$FIXTURE_LOG"\n',
		{ mode: 0o700 },
	);
	const env: Record<string, string> = {
		PATH: `${bin}:/usr/bin:/bin`,
		TMPDIR: root,
		NODE_OPTIONS: `--require=${guard}`,
		FIXTURE_LOG: log,
		NEXT_PUBLIC_API_URL: "https://api.fixture.invalid",
		USERCONTENT_URL: "https://frame.fixture.invalid",
		NUDGE_SECRET: "private-fixture-secret",
		S3_ENDPOINT: "https://s3.fixture.invalid",
		S3_BUCKET: "owned-private",
		S3_ACCESS_KEY: "owned-access",
		S3_SECRET_KEY: "owned-secret",
	};
	const template = join(worker, "realtime.capnp.in"),
		output = join(worker, "realtime.capnp");
	return {
		root,
		worker,
		template,
		output,
		log,
		env,
		run: (extra: Record<string, string> = {}) =>
			spawnSync(
				node,
				[join(worker, "render-realtime-config.mjs"), template, output],
				{
					cwd: root,
					env: { ...env, ...extra },
					encoding: "utf8",
					timeout: 5_000,
				},
			),
		start: (extra: Record<string, string> = {}) =>
			spawnSync("/bin/sh", [join(worker, "realtime-entrypoint.sh")], {
				cwd: root,
				env: { ...env, ...extra },
				encoding: "utf8",
				timeout: 5_000,
			}),
	};
}

test("filesystem failures identify the template and error code without environment values", () =>
	fixture((f) => {
		rmSync(f.template);
		const result = f.run();
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("ENOENT");
		expect(result.stderr).toContain(f.template);
		expect(result.stderr).not.toContain(f.env.S3_SECRET_KEY);
	}));

test("unwritable output reports its path and filesystem code without secrets", () =>
	fixture((f) => {
		chmodSync(f.worker, 0o500);
		try {
			const result = f.run();
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain("EACCES");
			expect(result.stderr).toContain(f.output);
			expect(result.stderr).not.toContain(f.env.S3_SECRET_KEY);
		} finally {
			chmodSync(f.worker, 0o700);
		}
	}));

test("actual config renderer binds both genuine SQLite hubs on isolated storage", () =>
	fixture((f) => {
		const r = f.run();
		expect(r.status).toBe(0);
		const out = readFileSync(f.output, "utf8");
		expect(out).toContain(
			'className = "OrgHub", uniqueKey = "superset_realtime_org_v1", enableSql = true',
		);
		expect(out).toContain(
			'className = "PageHub", uniqueKey = "superset_realtime_page_v1", enableSql = true',
		);
		expect(out).toContain('durableObjectStorage = (localDisk = "do-disk")');
		expect(out).toContain('compatibilityDate = "2026-07-01"');
		expect(out).toContain('compatibilityFlags = ["nodejs_als"]');
		expect(out).toContain('allow = ["public"]');
		expect(out).not.toContain('name = "SENTRY_DSN"');
		expect(out).not.toContain('name = "S3_REGION"');
		expect(out).not.toContain("@");
		expect(out).not.toContain("private-fixture-secret");
		expect(out).not.toContain("owned-secret");
		expect(statSync(f.output).mode & 0o777).toBe(0o600);
		expect(r.stdout + r.stderr).toBe("");
		const original = out;
		expect(f.run().status).toBe(0);
		expect(readFileSync(f.output, "utf8")).toBe(original);
	}));
test("exact private IPs and nonempty optional bindings preserve values outside capnp", () =>
	fixture((f) => {
		expect(
			f.run({
				REALTIME_PRIVATE_ADDRESSES: "10.0.0.3, fd00::3,10.0.0.3",
				SENTRY_DSN: "https://sentry.fixture.invalid/1",
				S3_REGION: "owned-region",
			}).status,
		).toBe(0);
		const out = readFileSync(f.output, "utf8");
		expect(out).toContain('allow = ["public", "10.0.0.3/32", "fd00::3/128"]');
		expect(out).toContain(
			'(name = "SENTRY_DSN", fromEnvironment = "SENTRY_DSN")',
		);
		expect(out).toContain(
			'(name = "S3_REGION", fromEnvironment = "S3_REGION")',
		);
		expect(out).not.toContain("owned-region");
		expect(out).not.toContain("sentry.fixture.invalid");
	}));
for (const name of [
	"NEXT_PUBLIC_API_URL",
	"USERCONTENT_URL",
	"NUDGE_SECRET",
	"S3_ENDPOINT",
	"S3_BUCKET",
	"S3_ACCESS_KEY",
	"S3_SECRET_KEY",
])
	test(`missing ${name} refuses before output or native execution`, () =>
		fixture((f) => {
			const r = f.start({ [name]: "" });
			expect(r.status).not.toBe(0);
			expect(existsSync(f.output)).toBe(false);
			expect(existsSync(f.log)).toBe(false);
			expect(r.stderr).not.toContain("owned-secret");
		}));
for (const [name, extra] of [
	[
		"API credentials",
		{ NEXT_PUBLIC_API_URL: "https://user:secret@api.fixture.invalid" },
	],
	["API path", { NEXT_PUBLIC_API_URL: "https://api.fixture.invalid/path" }],
	["API query", { NEXT_PUBLIC_API_URL: "https://api.fixture.invalid/?x=1" }],
	[
		"API encoded authority",
		{ NEXT_PUBLIC_API_URL: "https://%61pi.fixture.invalid" },
	],
	[
		"frame fragment",
		{ USERCONTENT_URL: "https://frame.fixture.invalid/#fragment" },
	],
	["frame path", { USERCONTENT_URL: "https://frame.fixture.invalid/path" }],
	["S3 credentials", { S3_ENDPOINT: "https://user:secret@s3.fixture.invalid" }],
	["S3 query", { S3_ENDPOINT: "https://s3.fixture.invalid?x=1" }],
	["private wildcard", { REALTIME_PRIVATE_ADDRESSES: "private" }],
	["address CIDR", { REALTIME_PRIVATE_ADDRESSES: "10.0.0.0/8" }],
	["IPv6 zone", { REALTIME_PRIVATE_ADDRESSES: "fe80::1%en0" }],
	["empty address", { REALTIME_PRIVATE_ADDRESSES: "10.0.0.3," }],
] as const)
	test(`${name} refuses before output or native execution`, () =>
		fixture((f) => {
			expect(f.start(extra).status).not.toBe(0);
			expect(existsSync(f.output)).toBe(false);
			expect(existsSync(f.log)).toBe(false);
		}));
test("S3 signing base path and empty optional values retain existing adapter semantics", () =>
	fixture((f) => {
		expect(
			f.run({
				S3_ENDPOINT: "https://s3.fixture.invalid/prefix",
				S3_REGION: "",
				SENTRY_DSN: " ",
			}).status,
		).toBe(0);
		const out = readFileSync(f.output, "utf8");
		expect(out).not.toContain('name = "S3_REGION"');
		expect(out).not.toContain('name = "SENTRY_DSN"');
	}));
test("unknown template marker refuses without replacing accepted output", () =>
	fixture((f) => {
		expect(f.run().status).toBe(0);
		const original = readFileSync(f.output, "utf8");
		writeFileSync(
			f.template,
			`${readFileSync(f.template, "utf8")}\n@UNKNOWN_BINDING@\n`,
		);
		expect(f.run().status).not.toBe(0);
		expect(readFileSync(f.output, "utf8")).toBe(original);
	}));
test("output symlink refuses without touching the linked file", () =>
	fixture((f) => {
		const sentinel = join(f.root, "sentinel");
		writeFileSync(sentinel, "preserve");
		symlinkSync(sentinel, f.output);
		expect(f.run().status).not.toBe(0);
		expect(readFileSync(sentinel, "utf8")).toBe("preserve");
	}));
test("actual entrypoint executes only separate realtime storage and generated config", () =>
	fixture((f) => {
		expect(f.start().status).toBe(0);
		expect(readFileSync(f.log, "utf8").split("\n")).toEqual([
			"serve",
			join(f.worker, "realtime.capnp"),
			"--directory-path",
			"do-disk=/data/realtime-durable-objects",
			"",
		]);
	}));
