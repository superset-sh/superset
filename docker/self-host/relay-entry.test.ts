import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const owned: string[] = [];
afterEach(() => {
	for (const path of owned.splice(0))
		rmSync(path, { recursive: true, force: true });
});
test("actual relay wrapper retains bundle identity and placement disk behavior", () => {
	const root = mkdtempSync("/tmp/relay-wrapper-");
	owned.push(root);
	copyFileSync(
		join(import.meta.dirname, "relay-entry.js"),
		join(root, "relay-entry.js"),
	);
	writeFileSync(
		join(root, "index.js"),
		"export class HostTunnel {}\nexport default {fetch:(...args)=>globalThis.fixtureWorker(...args)};",
	);
	writeFileSync(
		join(root, "fixture.test.ts"),
		`import {expect,mock,spyOn,test} from "bun:test";
 const deny=()=>{throw Error("Unexpected external operation")};globalThis.fetch=Object.assign(async()=>deny(),{preconnect:deny});
 const net=await import("node:net");spyOn(net.Socket.prototype,"connect").mockImplementation(deny);const cp=await import("node:child_process");for(const key of ["spawn","spawnSync","exec","execSync","execFile","execFileSync"] as const)spyOn(cp,key).mockImplementation(deny);spyOn(Bun,"spawn").mockImplementation(deny);spyOn(Bun,"spawnSync").mockImplementation(deny);mock.module("dotenv",()=>({config:deny}));
 const {default:wrapper,HostTunnel}=await import("./relay-entry.js");const bundle=await import("./index.js");
 const request=new Request("https://relay.fixture.invalid/health"),ctx={owned:true};
 type KV={get(key:string,type?:string):Promise<unknown>;put(key:string,value:string):Promise<void>};
let kv:KV;const calls:Array<{url:string;options?:RequestInit}>=[];let response=new Response(JSON.stringify({name:"org:machine#1",generation:1}));
 const disk={fetch:async(url:string,options?:RequestInit)=>{calls.push({url,options});return response}};
 Reflect.set(globalThis,"fixtureWorker",(r:Request,env:{NEXT_PUBLIC_API_URL:string;HostTunnel:unknown;PLACEMENT:KV},c:unknown)=>{expect(r).toBe(request);expect(c).toBe(ctx);expect(env.NEXT_PUBLIC_API_URL).toBe("https://api.fixture.invalid");expect(env.HostTunnel).toBe(HostTunnel);kv=env.PLACEMENT;return new Response("owned forwarded")});
 test("actual bundle class and request/context/bindings forwarded unchanged",async()=>{expect(HostTunnel).toBe(bundle.HostTunnel);const reply=await wrapper.fetch(request,{HostTunnel,NEXT_PUBLIC_API_URL:"https://api.fixture.invalid",PLACEMENT_DISK:disk,PLACEMENT:{get:deny}},ctx);expect(await reply.text()).toBe("owned forwarded");});
 test("placement JSON and plain-text reads preserve current KV surface",async()=>{expect(await kv.get("placement:org:machine","json")).toEqual({name:"org:machine#1",generation:1});response=new Response("plain");expect(await kv.get("placement:org:machine")).toBe("plain");});
 test("placement URLs retain one encoded key segment",async()=>{response=new Response("plain");await kv.get("placement:org:../other?query#fragment");expect(calls.at(-1).url).toBe("http://placement/placement%3Aorg%3A..%2Fother%3Fquery%23fragment");});
 test("missing and damaged local JSON return absent while disk errors fail",async()=>{response=new Response(null,{status:404});expect(await kv.get("placement:org:machine","json")).toBeNull();response=new Response("broken-json");expect(await kv.get("placement:org:machine","json")).toBeNull();response=new Response("private fixture body",{status:503});await expect(kv.get("placement:org:machine","json")).rejects.toThrow("Relay placement read failed");});
 test("placement put awaits disk acknowledgement and refuses failures",async()=>{response=new Response(null,{status:204});await kv.put("placement:org:machine","owned value");expect(calls.at(-1).options).toEqual({method:"PUT",body:"owned value"});response=new Response("private fixture body",{status:500});await expect(kv.put("placement:org:machine","owned value")).rejects.toThrow("Relay placement write failed");});`,
	);
	const child = spawnSync(
		process.execPath,
		["--no-env-file", "test", join(root, "fixture.test.ts")],
		{
			cwd: root,
			env: { PATH: "/usr/bin:/bin", TMPDIR: root },
			encoding: "utf8",
			timeout: 10_000,
		},
	);
	process.stdout.write(child.stdout);
	process.stderr.write(child.stderr);
	if (child.error) throw child.error;
	expect(child.status).toBe(0);
});
