import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import {
	mainExternalizedDependencies,
	requiredMaterializedNodeModules,
} from "../runtime-dependencies";
import { isPackagedModulePath } from "./packaged-module-paths";

const executable = process.argv[2];
const archive = process.argv[3];
if (
	!executable ||
	!archive ||
	!existsSync(executable) ||
	!existsSync(archive)
) {
	throw new Error(
		"Provide the exact packaged Electron executable and app.asar",
	);
}
const expectedPlatform = process.argv[4];
const expectedArch = process.argv[5];
const universalMac =
	expectedPlatform === "darwin" && expectedArch === "universal";
if (
	(expectedPlatform && expectedPlatform !== process.platform) ||
	(expectedArch && expectedArch !== process.arch && !universalMac)
) {
	console.log(
		JSON.stringify({
			packagedRuntime: false,
			platform: expectedPlatform,
			arch: expectedArch,
			pendingAcceptance: ["packaged-runtime-on-target"],
		}),
	);
	process.exit(0);
}
const runtimeArch = universalMac ? process.arch : expectedArch;
const probe = `
if (${JSON.stringify(expectedPlatform || "")} && process.platform!==${JSON.stringify(expectedPlatform || "")}) throw Error("Wrong packaged runtime platform");
if (${JSON.stringify(runtimeArch || "")} && process.arch!==${JSON.stringify(runtimeArch || "")}) throw Error("Wrong packaged runtime architecture");
const moduleApi=require("node:module");
const paths=require("node:path");
const isWithin=${isPackagedModulePath.toString()};
const {createRequire}=moduleApi;
const archive=${JSON.stringify(realpathSync(archive))};
const builtins=new Set([...moduleApi.builtinModules,...moduleApi.builtinModules.map(name=>"node:"+name)]);
const originalResolve=moduleApi._resolveFilename;
moduleApi._resolveFilename=function(request,parent,...args) {
 const result=originalResolve.call(this,request,parent,...args);
 if(parent && isWithin(archive,parent.filename,paths) && !builtins.has(result) && !isWithin(archive,result,paths) && !isWithin(archive+".unpacked",result,paths)) {
  throw Error("Package resolved outside accepted archive: "+request);
 }
 return result;
};
const r=createRequire(${JSON.stringify(`${realpathSync(archive)}/package.json`)});
for(const name of ${JSON.stringify(requiredMaterializedNodeModules)}) {
 try { r.resolve(name); } catch {r.resolve(name+"/package.json");}
}
for(const name of ${JSON.stringify(mainExternalizedDependencies.filter((name) => name !== "pg-native"))}) {
 if(name==="@superset/macos-process-metrics" && process.platform!=="darwin") continue;
 r(name);
}
r("ajv/dist/runtime/equal");r("ajv-formats/dist/formats");
const {Terminal}=r("@xterm/headless");
const terminal=new Terminal({cols:80,rows:24});
terminal.dispose();
const Database=r("better-sqlite3");
const db=new Database(":memory:");
if(db.prepare("SELECT 1 AS value").get().value!==1) throw Error("SQLite runtime query failed");
db.close();
console.log(JSON.stringify({packagedRuntime:true,platform:process.platform,arch:process.arch,materialized:${requiredMaterializedNodeModules.length},pendingAcceptance:${JSON.stringify(universalMac ? ["universal-other-architecture"] : [])}}));
`;
const result = spawnSync(resolve(executable), ["-e", probe], {
	env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
	encoding: "utf8",
	timeout: 110_000,
	maxBuffer: 1_000_000,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.status !== 0)
	throw new Error("Packaged runtime module validation failed");
