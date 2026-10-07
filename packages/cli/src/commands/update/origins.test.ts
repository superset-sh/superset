import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const commandModule = resolve(import.meta.dirname, "command.ts");

for (const [name, api, update, pinned, expected, failure, channel, hint] of [
	[
		"upstream rolling",
		"https://api.superset.sh",
		"",
		"",
		"https://github.com/superset-sh/superset/releases/download/cli-latest/version.txt",
		"",
	],
	[
		"owned rolling",
		"https://api.fixture.invalid",
		"https://downloads.fixture.invalid/cli/",
		"",
		"https://downloads.fixture.invalid/cli/cli-latest/version.txt",
		"",
	],
	[
		"owned pinned",
		"https://api.fixture.invalid",
		"https://downloads.fixture.invalid/cli",
		"1.35.1",
		"",
		"",
	],
	[
		"owned API with upstream feed",
		"https://api.fixture.invalid",
		"",
		"",
		"",
		"Refusing to update",
	],
	[
		"upstream API with owned feed",
		"https://api.superset.sh",
		"https://downloads.fixture.invalid/cli",
		"",
		"",
		"Refusing to update",
	],
	[
		"bundled owned installer hint",
		"https://api.fixture.invalid",
		"https://downloads.fixture.invalid/cli",
		"",
		"",
		"bundled with the Superset desktop app",
		"desktop-bundled",
		"https://downloads.fixture.invalid/cli/cli-latest/",
	],
	[
		"bundled upstream installer hint",
		"https://api.superset.sh",
		"",
		"",
		"",
		"bundled with the Superset desktop app",
		"desktop-bundled",
		"curl -fsSL https://superset.sh/cli/install.sh | sh",
	],
]) {
	test(`genuine update check ${name}`, () => {
		const directory = mkdtempSync(join(tmpdir(), "superset-cli-r3-update-"));
		try {
			const probe = join(directory, "probe.test.ts");
			writeFileSync(
				probe,
				`import {expect,mock,test} from 'bun:test';
mock.module('@lingui/core/macro',()=>({msg:(value:{message:string})=>value.message}));
const requests:string[]=[];
globalThis.fetch=Object.assign(async(input:RequestInfo|URL)=>{requests.push(String(input));return new Response('1.35.1\\n');},{preconnect(){}});
const {default:command}=await import(${JSON.stringify(commandModule)});
test('actual update check',async()=>{
const call=command.run({ctx:{} as never,args:{} as never,options:{check:true,version:${JSON.stringify(pinned || undefined)}} as never,signal:new AbortController().signal});
${failure ? `await expect(call).rejects.toThrow(${JSON.stringify(failure)});` : "const result=await call;expect(result?.data).toMatchObject({current:'1.35.0',target:'1.35.1',upToDate:false});"}
${hint ? `expect((await call.catch((error:Error&{suggestion?:string})=>error)).suggestion).toContain(${JSON.stringify(hint)});` : ""}
expect(requests).toEqual(${JSON.stringify(expected ? [expected] : [])});
});\n`,
			);
			const result = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", probe],
				{
					cwd: directory,
					env: {
						PATH: process.env.PATH,
						TMPDIR: tmpdir(),
						SUPERSET_VERSION: "1.35.0",
						SUPERSET_API_URL: api,
						CLI_UPDATE_BASE_URL: update,
						SUPERSET_CLI_CHANNEL: channel,
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
}
