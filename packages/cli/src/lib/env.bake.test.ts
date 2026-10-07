import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const envModule = resolve(import.meta.dirname, "env.ts");
const configModule = resolve(import.meta.dirname, "../../cli.config.ts");
const upstream = {
	api: "https://api.superset.sh",
	web: "https://app.superset.sh",
	relay: "https://relay.superset.sh",
	realtime: "https://realtime.superset.sh",
	update: "https://github.com/superset-sh/superset/releases/download",
};
const owned = {
	api: "https://api.fixture.invalid",
	web: "https://web.fixture.invalid",
	relay: "https://relay.fixture.invalid",
	realtime: "https://realtime.fixture.invalid",
	update: "https://downloads.fixture.invalid/cli",
};

function run(path: string, input: Record<string, string> = {}, cwd = tmpdir()) {
	const result = Bun.spawnSync([process.execPath, "--no-env-file", path], {
		cwd,
		env: { PATH: process.env.PATH, TMPDIR: tmpdir(), ...input },
		stdout: "pipe",
		stderr: "pipe",
		timeout: 20_000,
	});
	if (result.exitCode !== 0) process.stderr.write(result.stderr);
	expect(result.exitCode).toBe(0);
	return result.stdout.toString();
}

function fixture(
	input: Record<string, string>,
	verify: (probe: (runtime?: Record<string, string>) => typeof owned) => void,
	compiled = true,
) {
	const directory = mkdtempSync(join(tmpdir(), "superset-cli-r3-bake-"));
	try {
		const source = join(directory, "source.ts");
		writeFileSync(
			source,
			`${compiled ? "" : "import {mock} from 'bun:test';mock.module('@lingui/core/macro',()=>({msg:(value:{message:string})=>value.message}));"}
const {env}=await import(${JSON.stringify(envModule)});
console.log(JSON.stringify({api:env.SUPERSET_API_URL,web:env.SUPERSET_WEB_URL,relay:env.RELAY_URL,realtime:env.REALTIME_URL,update:env.CLI_UPDATE_BASE_URL}));\n`,
		);
		if (compiled) {
			const builder = join(directory, "build.ts");
			writeFileSync(
				builder,
				`const {default:config}=await import(${JSON.stringify(configModule)});
const result=await Bun.build({entrypoints:[${JSON.stringify(source)}],target:'bun',outdir:${JSON.stringify(directory)},naming:'probe.js',define:config.define,plugins:config.plugins});
if(!result.success)throw new Error(result.logs.map(String).join('\\n'));\n`,
			);
			run(builder, input, resolve(import.meta.dirname, "../.."));
		}
		verify((runtime = {}) =>
			JSON.parse(run(compiled ? join(directory, "probe.js") : source, runtime)),
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

test("compiled owned CLI keeps its addresses and update channel without runtime env", () => {
	fixture(
		{
			SUPERSET_API_URL: owned.api,
			SUPERSET_WEB_URL: owned.web,
			RELAY_URL: owned.relay,
			REALTIME_URL: owned.realtime,
			CLI_UPDATE_BASE_URL: owned.update,
		},
		(probe) => {
			expect(probe()).toEqual(owned);
			expect(
				probe({
					SUPERSET_API_URL: "",
					SUPERSET_WEB_URL: "",
					RELAY_URL: "",
					REALTIME_URL: "",
				}),
			).toEqual(owned);
		},
	);
}, 50_000);

test("runtime dev addresses override compiled defaults while update channel stays baked", () => {
	fixture(
		{
			SUPERSET_API_URL: owned.api,
			SUPERSET_WEB_URL: owned.web,
			RELAY_URL: owned.relay,
			REALTIME_URL: owned.realtime,
			CLI_UPDATE_BASE_URL: owned.update,
		},
		(probe) => {
			expect(
				probe({
					SUPERSET_API_URL: "http://localhost:6311",
					SUPERSET_WEB_URL: "http://localhost:6310",
					RELAY_URL: "http://localhost:6312",
					REALTIME_URL: "http://localhost:6313",
					CLI_UPDATE_BASE_URL: "https://other.fixture.invalid/cli",
				}),
			).toEqual({
				api: "http://localhost:6311",
				web: "http://localhost:6310",
				relay: "http://localhost:6312",
				realtime: "http://localhost:6313",
				update: owned.update,
			});
		},
	);
}, 50_000);

test("unconfigured compiled CLI preserves upstream defaults", () => {
	fixture({}, (probe) => expect(probe()).toEqual(upstream));
}, 50_000);

test("uncompiled CLI retains runtime address configuration", () => {
	fixture(
		{},
		(probe) => {
			expect(probe()).toEqual(upstream);
			expect(
				probe({
					SUPERSET_API_URL: owned.api,
					SUPERSET_WEB_URL: owned.web,
					RELAY_URL: owned.relay,
					REALTIME_URL: owned.realtime,
					CLI_UPDATE_BASE_URL: owned.update,
				}),
			).toEqual(owned);
		},
		false,
	);
}, 50_000);

test("actual desktop build passes desktop origins to its bundled CLI without running a build", () => {
	const directory = mkdtempSync(join(tmpdir(), "superset-cli-r3-desktop-"));
	try {
		const script = resolve(
			import.meta.dirname,
			"../../../../apps/desktop/scripts/build-bundled-cli.ts",
		);
		const probe = join(directory, "probe.test.ts");
		writeFileSync(
			probe,
			`import {expect,mock,test} from 'bun:test';
import {EventEmitter} from 'node:events';
let captured:NodeJS.ProcessEnv|undefined;
let dotenvOptions:unknown;
mock.module('dotenv',()=>({config:(options:unknown)=>{dotenvOptions=options;return {parsed:{}};}}));
mock.module('node:fs',()=>({chmodSync(){},mkdirSync(){}}));
mock.module('node:child_process',()=>({spawn:(_command:string,_args:string[],options:{env:NodeJS.ProcessEnv})=>{
captured=options.env;const child=new EventEmitter();queueMicrotask(()=>child.emit('exit',0));return child;
}}));
await import(${JSON.stringify(script)});
test('genuine desktop build child environment',()=>{
expect(dotenvOptions).toMatchObject({override:false,quiet:true});
expect(captured).toMatchObject({SUPERSET_API_URL:${JSON.stringify(owned.api)},SUPERSET_WEB_URL:${JSON.stringify(owned.web)},RELAY_URL:${JSON.stringify(owned.relay)},CLI_UPDATE_BASE_URL:${JSON.stringify(owned.update)},SUPERSET_CLI_CHANNEL:'desktop-bundled'});
});\n`,
		);
		const result = Bun.spawnSync(
			[process.execPath, "--no-env-file", "test", probe],
			{
				cwd: directory,
				env: {
					PATH: process.env.PATH,
					TMPDIR: tmpdir(),
					TARGET_PLATFORM: "darwin",
					TARGET_ARCH: "arm64",
					NEXT_PUBLIC_API_URL: owned.api,
					NEXT_PUBLIC_WEB_URL: owned.web,
					RELAY_URL: owned.relay,
					REALTIME_URL: owned.realtime,
					CLI_UPDATE_BASE_URL: owned.update,
					SUPERSET_API_URL: "http://localhost:4001",
					SUPERSET_WEB_URL: "http://localhost:4000",
				},
				stdout: "pipe",
				stderr: "pipe",
				timeout: 20_000,
			},
		);
		process.stdout.write(result.stdout);
		process.stderr.write(result.stderr);
		expect(result.exitCode).toBe(0);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}, 25_000);
