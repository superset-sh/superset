import { afterEach, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
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

const owned: string[] = [];
afterEach(() => {
	for (const path of owned.splice(0))
		rmSync(path, { recursive: true, force: true });
});
const node =
	Bun.which("node") ??
	(() => {
		throw new Error("Node is required for the renderer fixtures");
	})();
test("relay rendering refuses an output alias of its input without changing the template", () => {
	const f = fixture();
	const template = join(f.worker, "relay.capnp.in");
	const original = readFileSync(template);
	const result = f.run({}, template);
	expect(result.status).not.toBe(0);
	expect(readFileSync(template)).toEqual(original);
});
test("malformed API ports name the configuration input without echoing its value", () => {
	const f = fixture();
	const result = f.run({
		NEXT_PUBLIC_API_URL: "https://api.fixture.invalid:bad",
	});
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain("NEXT_PUBLIC_API_URL");
	expect(result.stderr).not.toContain("api.fixture.invalid:bad");
});
test("relay rendering refuses lexical and symlink aliases before writing", () => {
	const f = fixture();
	const original = readFileSync(f.template);
	expect(f.run({}, `${f.worker}/../worker/relay.capnp.in`).status).not.toBe(0);
	const alias = join(f.worker, "alias.capnp");
	symlinkSync(f.template, alias);
	expect(f.run({}, alias).status).not.toBe(0);
	expect(readFileSync(f.template)).toEqual(original);
});
function fixture() {
	const root = mkdtempSync("/tmp/relay-render-");
	owned.push(root);
	const worker = join(root, "worker"),
		data = join(root, "data"),
		doDir = join(data, "durable-objects"),
		placement = join(data, "placement"),
		bin = join(root, "bin");
	mkdirSync(worker);
	mkdirSync(bin);
	mkdirSync(doDir, { recursive: true });
	mkdirSync(placement, { recursive: true });
	for (const file of [
		"render-relay-config.mjs",
		"relay.capnp.in",
		"relay-entrypoint.sh",
	])
		copyFileSync(join(import.meta.dirname, file), join(worker, file));
	const guard = join(root, "deny.cjs");
	writeFileSync(
		guard,
		`const deny=()=>{throw Error("Unexpected external operation")};globalThis.fetch=deny;const net=require("node:net");net.Socket.prototype.connect=deny;const cp=require("node:child_process");for(const k of ["spawn","spawnSync","exec","execSync","execFile","execFileSync"])cp[k]=deny;const Module=require("node:module"),load=Module._load;Module._load=function(name,...args){if(name==="dotenv")return {config:deny};return load.call(this,name,...args)};const fs=require("node:fs"),read=fs.readFileSync;fs.readFileSync=function(path,...args){if(typeof path==="string"&&/(^|\\/)\\.env(?:\\.|$)/.test(path))deny();return read.call(this,path,...args)};`,
	);
	const log = join(root, "workerd-args");
	writeFileSync(
		join(bin, "workerd"),
		'#!/bin/sh\nprintf \'%s\\n\' "$@" > "$FIXTURE_LOG"\n',
		{ mode: 0o700 },
	);
	symlinkSync(node, join(bin, "node"));
	const env = {
		PATH: `${bin}:/usr/bin:/bin`,
		TMPDIR: root,
		NODE_OPTIONS: `--require=${guard}`,
		NEXT_PUBLIC_API_URL: "https://api.fixture.invalid",
		RELAY2_DO_DIR: doDir,
		RELAY2_PLACEMENT_DIR: placement,
		FIXTURE_LOG: log,
	};
	const command = join(worker, "render-relay-config.mjs"),
		template = join(worker, "relay.capnp.in"),
		output = join(worker, "relay.capnp"),
		key = join(doDir, ".do-unique-key");
	const run = (extra: Record<string, string> = {}, rendered = output) =>
		spawnSync(node, [command, template, rendered], {
			cwd: root,
			env: { ...env, ...extra },
			encoding: "utf8",
			timeout: 10_000,
		});
	return {
		root,
		worker,
		doDir,
		placement,
		command,
		template,
		output,
		key,
		env,
		log,
		run,
	};
}
test("renders a private persistent key, exact current Worker bindings and public-only outbound", () => {
	const f = fixture(),
		r = f.run();
	expect(r.status).toBe(0);
	const key = readFileSync(f.key, "utf8"),
		out = readFileSync(f.output, "utf8");
	expect(key).toMatch(/^[a-f0-9]{32}$/);
	expect(statSync(f.key).mode & 0o777).toBe(0o600);
	expect(statSync(f.output).mode & 0o777).toBe(0o600);
	expect(out).toContain(`uniqueKey = "${key}"`);
	expect(out).toContain('allow = ["public"]');
	expect(out).not.toContain("@");
	expect(out).toContain('compatibilityDate = "2026-07-01"');
	expect(out).toContain('compatibilityFlags = ["nodejs_als"]');
	expect(out).not.toContain('name = "SENTRY_DSN"');
	expect(r.stdout + r.stderr).not.toContain(key);
});
test("restart retains key and configured mismatch never orphans it", () => {
	const f = fixture();
	expect(f.run({ RELAY2_DO_UNIQUE_KEY: "owned-existing-key" }).status).toBe(0);
	expect(f.run().status).toBe(0);
	expect(readFileSync(f.key, "utf8")).toBe("owned-existing-key");
	expect(f.run({ RELAY2_DO_UNIQUE_KEY: "different-key" }).status).not.toBe(0);
	expect(readFileSync(f.key, "utf8")).toBe("owned-existing-key");
});
test("exact IPv4/IPv6 operator exceptions and nonempty optional Sentry binding render without values", () => {
	const f = fixture();
	expect(
		f.run({
			RELAY2_API_PRIVATE_ADDRESSES: "10.0.0.3,fd00::3,10.0.0.3",
			SENTRY_DSN: "https://owned-fixture-dsn.invalid/1",
		}).status,
	).toBe(0);
	const out = readFileSync(f.output, "utf8");
	expect(out).toContain('allow = ["public", "10.0.0.3/32", "fd00::3/128"]');
	expect(out).toContain(
		'(name = "SENTRY_DSN", fromEnvironment = "SENTRY_DSN")',
	);
	expect(out).not.toContain("owned-fixture-dsn");
});
for (const [name, extra] of [
	["invalid key", { RELAY2_DO_UNIQUE_KEY: '"injected' }],
	["private wildcard", { RELAY2_API_PRIVATE_ADDRESSES: "private" }],
	["address CIDR", { RELAY2_API_PRIVATE_ADDRESSES: "10.0.0.0/8" }],
	["IPv6 zone", { RELAY2_API_PRIVATE_ADDRESSES: "fe80::1%en0" }],
	[
		"API credentials",
		{ NEXT_PUBLIC_API_URL: "https://user:password@api.fixture.invalid" },
	],
	["API path", { NEXT_PUBLIC_API_URL: "https://api.fixture.invalid/path" }],
	["API query", { NEXT_PUBLIC_API_URL: "https://api.fixture.invalid/?x=1" }],
] as const)
	test(`${name} refuses before generating state or output`, () => {
		const f = fixture();
		expect(f.run(extra).status).not.toBe(0);
		expect(existsSync(f.key)).toBe(false);
		expect(existsSync(f.output)).toBe(false);
	});
test("same/nested/aliased storage directories refuse", () => {
	const f = fixture();
	expect(f.run({ RELAY2_PLACEMENT_DIR: f.doDir }).status).not.toBe(0);
	expect(
		f.run({ RELAY2_PLACEMENT_DIR: join(f.doDir, "nested") }).status,
	).not.toBe(0);
	const alias = join(f.root, "alias");
	symlinkSync(f.doDir, alias);
	expect(f.run({ RELAY2_PLACEMENT_DIR: alias }).status).not.toBe(0);
	expect(existsSync(f.key)).toBe(false);
});
test("key symlink and missing/unknown template markers refuse without rewriting stored key", () => {
	const f = fixture(),
		other = join(f.root, "other-key");
	writeFileSync(other, "owned-other-key", { mode: 0o600 });
	symlinkSync(other, f.key);
	expect(f.run().status).not.toBe(0);
	expect(readFileSync(other, "utf8")).toBe("owned-other-key");
	rmSync(f.key);
	writeFileSync(
		f.template,
		"@DO_UNIQUE_KEY@ @API_PRIVATE_ADDRESSES@ @UNEXPECTED@",
	);
	expect(f.run().status).not.toBe(0);
	expect(existsSync(f.key)).toBe(false);
});
test("concurrent first renders expose only one complete persistent namespace key", async () => {
	const f = fixture();
	const run = (output: string) =>
		new Promise<number | null>((resolve, reject) => {
			const child = spawn(node, [f.command, f.template, output], {
				cwd: f.root,
				env: f.env,
				stdio: "pipe",
			});
			let failure: Error | undefined;
			const deadline = setTimeout(() => {
				failure = Error("Owned renderer deadline");
				child.kill("SIGKILL");
			}, 10_000);
			child.once("error", (error) => {
				failure = error;
			});
			child.once("close", (code) => {
				clearTimeout(deadline);
				if (failure) reject(failure);
				else resolve(code);
			});
		});
	expect(
		await Promise.allSettled([
			run(join(f.worker, "first.capnp")),
			run(join(f.worker, "second.capnp")),
		]),
	).toEqual([
		{ status: "fulfilled", value: 0 },
		{ status: "fulfilled", value: 0 },
	]);
	const key = readFileSync(f.key, "utf8");
	for (const file of ["first.capnp", "second.capnp"])
		expect(readFileSync(join(f.worker, file), "utf8")).toContain(
			`uniqueKey = "${key}"`,
		);
}, 15_000);
test("actual entrypoint renders then execs only the owned workerd boundary with separate disk mappings", () => {
	const f = fixture();
	const child = spawnSync("/bin/sh", [join(f.worker, "relay-entrypoint.sh")], {
		cwd: f.root,
		env: f.env,
		encoding: "utf8",
		timeout: 10_000,
	});
	expect(child.status).toBe(0);
	expect(readFileSync(f.log, "utf8").split("\n").filter(Boolean)).toEqual([
		"serve",
		f.output,
		"--directory-path",
		`do-disk=${f.doDir}`,
		"--directory-path",
		`placement-disk=${f.placement}`,
	]);
	const other = fixture();
	const refused = spawnSync(
		"/bin/sh",
		[join(other.worker, "relay-entrypoint.sh")],
		{
			cwd: other.root,
			env: { ...other.env, NEXT_PUBLIC_API_URL: "" },
			encoding: "utf8",
			timeout: 10_000,
		},
	);
	expect(refused.status).not.toBe(0);
	expect(existsSync(other.log)).toBe(false);
});

test("released stored newline is retained and output cannot overwrite namespace key", () => {
	const f = fixture();
	writeFileSync(f.key, "owned-stored-key\n", { mode: 0o600 });
	expect(f.run().status).toBe(0);
	expect(readFileSync(f.key, "utf8")).toBe("owned-stored-key\n");
	expect(readFileSync(f.output, "utf8")).toContain(
		'uniqueKey = "owned-stored-key"',
	);
	expect(f.run({}, f.key).status).not.toBe(0);
	expect(readFileSync(f.key, "utf8")).toBe("owned-stored-key\n");
});
test("template follows the current app and Docker entrypoint lives beside renderer", () => {
	const f = fixture(),
		source = readFileSync(f.template, "utf8");
	const wrangler = JSON.parse(
		readFileSync(
			join(import.meta.dirname, "../../apps/relay/wrangler.jsonc"),
			"utf8",
		).replace(/^\s*\/\/.*$/gm, ""),
	);
	expect(source).toContain(
		`compatibilityDate = "${wrangler.compatibility_date}"`,
	);
	for (const flag of wrangler.compatibility_flags)
		expect(source).toContain(`"${flag}"`);
	expect(source).toContain(
		`className = "${wrangler.durable_objects.bindings[0].class_name}"`,
	);
	const docker = readFileSync(
		join(import.meta.dirname, "relay.Dockerfile"),
		"utf8",
	);
	expect(docker).toContain('ENTRYPOINT ["/worker/relay-entrypoint.sh"]');
	expect(docker).toContain("WORKDIR /worker");
	expect(docker).toContain(
		"COPY --chown=node:node --chmod=0755 docker/self-host/relay-entrypoint.sh ./relay-entrypoint.sh",
	);
	expect(docker).not.toContain("npm install -g");
	expect(docker).toContain("bun install --frozen-lockfile --ignore-scripts");
	expect(docker).toContain("wrangler deploy --dry-run --outdir=/bundle");
	expect(docker).toContain("USER node");
});
