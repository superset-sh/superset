import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
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
	const root = mkdtempSync("/tmp/superset-usercontent-config-");
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
		"render-usercontent-config.mjs",
		"usercontent.capnp",
		"usercontent-entrypoint.sh",
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
		USERCONTENT_URL: "https://frame.fixture.invalid",
		MEDIA_URL: "https://media.fixture.invalid",
		APP_URL: "https://app.fixture.invalid",
		REALTIME_URL: "https://realtime.fixture.invalid",
		FRAME_ANCESTORS: "https://app.fixture.invalid file:",
		USERCONTENT_TOKEN_SECRET: "owned-current-token-secret-32-characters",
		S3_ENDPOINT: "https://s3.fixture.invalid",
		S3_BUCKET: "owned-private",
		S3_ACCESS_KEY: "owned-access",
		S3_SECRET_KEY: "owned-secret",
	};
	const template = join(worker, "usercontent.capnp"),
		output = join(worker, "usercontent.runtime.capnp");
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
				[join(worker, "render-usercontent-config.mjs"), template, output],
				{
					cwd: root,
					env: { ...env, ...extra },
					encoding: "utf8",
					timeout: 5_000,
				},
			),
		start: (extra: Record<string, string> = {}) =>
			spawnSync("/bin/sh", [join(worker, "usercontent-entrypoint.sh")], {
				cwd: root,
				env: { ...env, ...extra },
				encoding: "utf8",
				timeout: 5_000,
			}),
	};
}
test("real usercontent startup preserves mandatory binding names and public-only outbound", () =>
	fixture((f) => {
		const r = f.run();
		expect(r.status).toBe(0);
		const out = readFileSync(f.output, "utf8");
		expect(out).toContain('allow = ["public"]');
		expect(out).not.toContain('"private"');
		for (const name of [
			"USERCONTENT_URL",
			"MEDIA_URL",
			"APP_URL",
			"REALTIME_URL",
			"FRAME_ANCESTORS",
			"USERCONTENT_TOKEN_SECRET",
			"S3_ENDPOINT",
			"S3_BUCKET",
			"S3_ACCESS_KEY",
			"S3_SECRET_KEY",
		])
			expect(out).toContain(`(name = "${name}", fromEnvironment = "${name}")`);
		for (const name of [
			"S3_REGION",
			"SENTRY_DSN",
			"USERCONTENT_TOKEN_SECRET_PREVIOUS",
		])
			expect(out).not.toContain(`name = "${name}"`);
		expect(out).toContain('compatibilityDate = "2026-07-01"');
		expect(out).toContain('compatibilityFlags = ["nodejs_als"]');
		expect(out).toContain('esModule = embed "usercontent-entry.js"');
		expect(statSync(f.output).mode & 0o777).toBe(0o600);
		expect(out).not.toContain("owned-secret");
		expect(out).not.toContain("owned-current-token");
		expect(r.stdout + r.stderr).toBe("");
	}));
test("explicit exact addresses and genuine optional rotation/Sentry/region bindings are emitted without values", () =>
	fixture((f) => {
		expect(
			f.run({
				USERCONTENT_PRIVATE_ADDRESSES: "10.0.0.3, fd00::3,10.0.0.3",
				S3_REGION: "owned-region",
				SENTRY_DSN: "https://sentry.fixture.invalid/1",
				USERCONTENT_TOKEN_SECRET_PREVIOUS:
					"owned-previous-token-secret-32-characters",
			}).status,
		).toBe(0);
		const out = readFileSync(f.output, "utf8");
		expect(out).toContain('allow = ["public", "10.0.0.3/32", "fd00::3/128"]');
		for (const name of [
			"S3_REGION",
			"SENTRY_DSN",
			"USERCONTENT_TOKEN_SECRET_PREVIOUS",
		])
			expect(out).toContain(`(name = "${name}", fromEnvironment = "${name}")`);
		expect(out).not.toContain("owned-region");
		expect(out).not.toContain("owned-previous-token");
	}));
for (const name of [
	"USERCONTENT_URL",
	"MEDIA_URL",
	"APP_URL",
	"REALTIME_URL",
	"FRAME_ANCESTORS",
	"USERCONTENT_TOKEN_SECRET",
	"S3_ENDPOINT",
	"S3_BUCKET",
	"S3_ACCESS_KEY",
	"S3_SECRET_KEY",
])
	test(`missing ${name} refuses before starting native workerd`, () =>
		fixture((f) => {
			expect(f.start({ [name]: "" }).status).not.toBe(0);
			expect(existsSync(f.output)).toBe(false);
			expect(existsSync(f.log)).toBe(false);
		}));
for (const addresses of [
	"private",
	"10.0.0.0/8",
	"fe80::1%en0",
	"10.0.0.3,",
	Array(65).fill("10.0.0.3").join(","),
])
	test(`unsupported outbound exceptions refuse ${addresses.slice(0, 40)}`, () =>
		fixture((f) => {
			expect(
				f.start({ USERCONTENT_PRIVATE_ADDRESSES: addresses }).status,
			).not.toBe(0);
			expect(existsSync(f.output)).toBe(false);
			expect(existsSync(f.log)).toBe(false);
		}));
test("empty optional inputs remain absent rather than null environment bindings", () =>
	fixture((f) => {
		expect(
			f.run({
				S3_REGION: "",
				SENTRY_DSN: " ",
				USERCONTENT_TOKEN_SECRET_PREVIOUS: "",
			}).status,
		).toBe(0);
		const out = readFileSync(f.output, "utf8");
		for (const name of [
			"S3_REGION",
			"SENTRY_DSN",
			"USERCONTENT_TOKEN_SECRET_PREVIOUS",
		])
			expect(out).not.toContain(`name = "${name}"`);
	}));
test("S3 endpoint paths are supported but queries and fragments refuse before startup", () =>
	fixture((f) => {
		expect(
			f.run({ S3_ENDPOINT: "https://s3.fixture.invalid/storage" }).status,
		).toBe(0);
		for (const endpoint of [
			"https://s3.fixture.invalid/storage?region=x",
			"https://s3.fixture.invalid/storage#ignored",
		]) {
			const r = f.start({ S3_ENDPOINT: endpoint });
			expect(r.status).not.toBe(0);
			expect(r.stderr).toContain("S3_ENDPOINT");
			expect(existsSync(f.log)).toBe(false);
		}
	}));
test("current and previous ticket secrets enforce the runtime minimum without exposing values", () =>
	fixture((f) => {
		for (const name of [
			"USERCONTENT_TOKEN_SECRET",
			"USERCONTENT_TOKEN_SECRET_PREVIOUS",
		]) {
			const r = f.start({ [name]: "x".repeat(31) });
			expect(r.status).not.toBe(0);
			expect(r.stderr).toContain(name);
			expect(r.stderr).not.toContain("x".repeat(31));
			expect(existsSync(f.log)).toBe(false);
			expect(f.run({ [name]: "x".repeat(32) }).status).toBe(0);
		}
	}));
test("unknown template marker and output symlink refuse while retaining accepted files", () =>
	fixture((f) => {
		expect(f.run().status).toBe(0);
		const original = readFileSync(f.output, "utf8");
		writeFileSync(
			f.template,
			`${readFileSync(f.template, "utf8")}\n@UNKNOWN_BINDING@\n`,
		);
		expect(f.run().status).not.toBe(0);
		expect(readFileSync(f.output, "utf8")).toBe(original);
		rmSync(f.output);
		const sentinel = join(f.root, "sentinel");
		writeFileSync(sentinel, "preserve");
		symlinkSync(sentinel, f.output);
		expect(f.run().status).not.toBe(0);
		expect(readFileSync(sentinel, "utf8")).toBe("preserve");
	}));
test("actual entrypoint starts rendered usercontent config and never binds relay/realtime data", () =>
	fixture((f) => {
		expect(f.start().status).toBe(0);
		expect(readFileSync(f.log, "utf8").split("\n")).toEqual([
			"serve",
			join(f.worker, "usercontent.runtime.capnp"),
			"",
		]);
	}));
