import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const commandModule = resolve(import.meta.dirname, "command.ts");
const cases = [
	["rolling immutable release", "", "", "", "", ""],
	["pinned release", "cli-v1.35.1", "", "", "", ""],
	["legacy missing checksums", "", "404", "", "", ""],
	["legacy absent version marker", "", "404", "absent", "", ""],
	["shared-parent staging symlink", "", "", "", "", ""],
	["checksum mismatch", "", "mismatch", "", "", "checksum mismatch"],
	["missing checksum entry", "", "missing", "", "", "checksum mismatch"],
	["checksum service failure", "", "500", "", "", "Checksum download failed"],
	[
		"packaged version mismatch",
		"",
		"",
		"1.99.0",
		"",
		"archive version mismatch",
	],
	["binary version mismatch", "", "", "", "1.99.0", "binary version mismatch"],
	["binary probe failure", "", "", "", "failure", "version probe failed"],
	[
		"invalid rolling manifest",
		"",
		"",
		"",
		"",
		"version manifest",
		"<html>maintenance</html>",
	],
	["unsafe rolling manifest", "", "", "", "", "version manifest", "../other"],
] as const;

for (const [
	name,
	pinned,
	checksum,
	marker,
	binary,
	failure,
	manifest,
] of cases) {
	test(`actual updater archive ${name}`, () => {
		const directory = mkdtempSync(join(tmpdir(), "superset-cli-integrity-"));
		try {
			const probe = join(directory, "probe.test.ts");
			writeFileSync(
				probe,
				`import {expect,mock,test} from 'bun:test';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {appendFileSync,chmodSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {basename,join} from 'node:path';
mock.module('@lingui/core/macro',()=>({msg:(value:{message:string})=>value.message}));
const root=join(import.meta.dirname,'install');
let attackerPath='';
const sentinel=join(import.meta.dirname,'sentinel');
writeFileSync(sentinel,'untouched sentinel');
${name === "shared-parent staging symlink" ? `const realMkdtemp=mkdtempSync;const originalFs={...fs};mock.module('node:fs',()=>({...originalFs,mkdtempSync:(prefix:string)=>{const directory=realMkdtemp(prefix);if(prefix===process.env.SUPERSET_INSTALL_ROOT+'.update-'){attackerPath=directory+'.tar.gz';symlinkSync(sentinel,attackerPath);}return directory;}}));` : ""}
const stageLog=join(import.meta.dirname,'stage-log');
writeFileSync(stageLog,'');
const tools=join(import.meta.dirname,'tools');
mkdirSync(tools);
writeFileSync(join(tools,'tar'),${JSON.stringify(["#!/bin/sh", 'printf "extract\\n" >> "$SUPERSET_UPDATE_STAGE_LOG"', 'exec /usr/bin/tar "$@"', ""].join("\n"))});
chmodSync(join(tools,'tar'),0o755);
mkdirSync(join(root,'bin'),{recursive:true});
writeFileSync(join(root,'bin','superset'),'old cli');
writeFileSync(join(root,'bin','superset-host'),'old host');
const archiveRoot=join(import.meta.dirname,'payload');
mkdirSync(join(archiveRoot,'bin'),{recursive:true});
mkdirSync(join(archiveRoot,'share'),{recursive:true});
${marker === "absent" ? "" : `writeFileSync(join(archiveRoot,'share','version.txt'),${JSON.stringify(marker || "1.35.1")});`}
const cliContents=${JSON.stringify(["#!/bin/sh", '[ "$#" -eq 1 ] && [ "$1" = "--version" ] || exit 64', 'printf "probe\\n" >> "$SUPERSET_UPDATE_STAGE_LOG"', binary === "failure" ? "exit 1" : `printf '%s\\n' '${binary || "1.35.1"}'`, ""].join("\n"))};
writeFileSync(join(archiveRoot,'bin','superset'),cliContents);
writeFileSync(join(archiveRoot,'bin','superset-host'),'fixture host');
chmodSync(join(archiveRoot,'bin','superset'),0o755);
const archivePath=join(import.meta.dirname,'archive.tar.gz');
const packed=Bun.spawnSync(['/usr/bin/tar','-czf',archivePath,'-C',archiveRoot,'.'],{stdout:'pipe',stderr:'pipe',timeout:5000});
if(packed.exitCode!==0)throw new Error('owned archive fixture creation failed');
const bytes=readFileSync(archivePath);
const asset='superset-'+process.platform+'-'+(process.arch==='arm64'?'arm64':'x64')+'.tar.gz';
const hash=createHash('sha256').update(bytes).digest('hex');
const requests:string[]=[];
globalThis.fetch=Object.assign(async(input:RequestInfo|URL)=>{
 const url=String(input);requests.push(url);
 if(url.endsWith('/version.txt'))return new Response(${JSON.stringify(manifest ?? "1.35.1\n")});
 if(url.endsWith('/'+asset))return new Response(bytes);
 if(url.endsWith('/sha256sums.txt')){
  appendFileSync(stageLog,'checksums\\n');
  const mode=${JSON.stringify(checksum)};
  if(mode==='404'||mode==='500')return new Response('',{status:Number(mode)});
  return new Response((mode==='mismatch'?'0'.repeat(64):hash)+'  '+(mode==='missing'?'other.tar.gz':asset)+'\\n');
 }
 throw new Error('Unexpected fixture request: '+url);
},{preconnect(){}});
const {default:command}=await import(${JSON.stringify(commandModule)});
test('genuine update install',async()=>{
 const call=command.run({ctx:{} as never,args:{} as never,options:{version:${JSON.stringify(pinned || undefined)},check:${!!manifest}} as never,signal:new AbortController().signal});
 ${failure ? `await expect(call).rejects.toThrow(${JSON.stringify(failure)});expect(readFileSync(join(root,'bin','superset'),'utf8')).toBe('old cli');expect(readFileSync(join(root,'bin','superset-host'),'utf8')).toBe('old host');` : `expect((await call)?.data).toMatchObject({target:'1.35.1',updated:true});${marker === "absent" ? "expect(existsSync(join(root,'share','version.txt'))).toBe(false);" : "expect(readFileSync(join(root,'share','version.txt'),'utf8')).toBe('1.35.1');"}expect(readFileSync(join(root,'bin','superset'),'utf8')).toBe(cliContents);expect(readFileSync(join(root,'bin','superset-host'),'utf8')).toBe('fixture host');for(const name of ['superset','superset-host'])expect(statSync(join(root,'bin',name)).mode&0o777).toBe(0o755);`}
 expect(readFileSync(stageLog,'utf8').trim().split('\\n').filter(Boolean)).toEqual(${JSON.stringify(manifest ? [] : ["checksums", ...(["mismatch", "missing", "500"].includes(checksum) ? [] : ["extract", ...(marker && marker !== "absent" ? [] : ["probe"])])])});
 expect(requests).toEqual([${manifest ? "'https://downloads.fixture.invalid/cli/cli-latest/version.txt'" : `${pinned ? "" : "'https://downloads.fixture.invalid/cli/cli-latest/version.txt',"}'https://downloads.fixture.invalid/cli/cli-v1.35.1/'+asset,'https://downloads.fixture.invalid/cli/cli-v1.35.1/sha256sums.txt'`}]);
 expect(existsSync(root+'.update-lock')).toBe(false);
 expect(existsSync(root+'.bak')).toBe(false);
 expect(readFileSync(sentinel,'utf8')).toBe('untouched sentinel');
 ${name === "shared-parent staging symlink" ? "expect(lstatSync(attackerPath).isSymbolicLink()).toBe(true);" : ""}
 expect(readdirSync(import.meta.dirname).filter(name=>name.startsWith('install.update-')&&name!==basename(attackerPath))).toEqual([]);
});\n`,
			);
			const result = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", probe],
				{
					cwd: directory,
					env: {
						PATH: `${join(directory, "tools")}:/usr/bin:/bin`,
						TMPDIR: directory,
						SUPERSET_INSTALL_ROOT: join(directory, "install"),
						SUPERSET_VERSION: "1.35.0",
						SUPERSET_API_URL: "https://api.fixture.invalid",
						CLI_UPDATE_BASE_URL: "https://downloads.fixture.invalid/cli",
						SUPERSET_UPDATE_STAGE_LOG: join(directory, "stage-log"),
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
