import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

test("actual realtime wrapper, instrumented hubs and current Worker routes", () => {
	const root = mkdtempSync("/tmp/superset-realtime-entry-");
	try {
		for (const file of ["realtime-entry.js", "s3-bucket.js"])
			copyFileSync(join(import.meta.dirname, file), join(root, file));
		const source = resolve(
			import.meta.dirname,
			"../../apps/realtime/src/index.ts",
		);
		writeFileSync(
			join(root, "index.js"),
			`export {default, OrgHub, PageHub} from ${JSON.stringify(source)};`,
		);
		writeFileSync(
			join(root, "fixture.test.ts"),
			`
import {afterEach,beforeEach,expect,mock,spyOn,test} from "bun:test";
const {Database}=await import("bun:sqlite");const databases=[];afterEach(()=>{for(const db of databases.splice(0))db.close();});
const deny=()=>{throw Error("Unexpected external operation")};
const cp=await import("node:child_process");for(const key of ["spawn","spawnSync","exec","execSync","execFile","execFileSync"])spyOn(cp,key).mockImplementation(deny);
spyOn(Bun,"spawn").mockImplementation(deny);spyOn(Bun,"spawnSync").mockImplementation(deny);
const net=await import("node:net");spyOn(net.Socket.prototype,"connect").mockImplementation(deny);mock.module("dotenv",()=>({config:deny}));
mock.module("cloudflare:workers",()=>({env:{},DurableObject:class {constructor(ctx,env){this.ctx=ctx;this.env=env;}}}));
const closed=[];globalThis.WebSocketPair=class {0={};1={accept(){},close(code,reason){closed.push({code,reason});}}};
const NativeResponse=Response;globalThis.Response=class extends NativeResponse {constructor(body,init){super(body,init?.status===101?{...init,status:200}:init);if(init?.status===101)Object.defineProperty(this,"status",{value:101});}};
const calls=[];const PAGE="aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",ORG="org-fixture",USER="user-fixture";
let storageStatus=200,storageBody;
let jwks;globalThis.fetch=Object.assign(async(url,options)=>{const u=url instanceof URL?url:new URL(typeof url==="string"?url:url.url);calls.push({url:u.href,options});if(u.href==="https://api.fixture.invalid/api/auth/jwks")return Response.json(jwks);if(u.host==="s3.fixture.invalid")return new Response(storageBody,{status:storageStatus});return deny();},{preconnect:deny});
const {default:worker,OrgHub,PageHub}=await import("./realtime-entry.js");const bundle=await import("./index.js");
const {generateKeyPair,exportJWK,SignJWT}=await import(${JSON.stringify(resolve(import.meta.dirname, "../../apps/realtime/node_modules/jose/dist/webapi/index.js"))});
const {privateKey,publicKey}=await generateKeyPair("RS256");const jwk=await exportJWK(publicKey);jwk.kid="fixture";jwk.alg="RS256";jwks={keys:[jwk]};
const claims=async(orgs=[ORG])=>new SignJWT({organizationIds:orgs,name:"Ada",image:null}).setProtectedHeader({alg:"RS256",kid:"fixture"}).setIssuer("https://api.fixture.invalid").setAudience("https://api.fixture.invalid").setSubject(USER).setIssuedAt().setExpirationTime("10m").sign(privateKey);
const env={NEXT_PUBLIC_API_URL:"https://api.fixture.invalid",USERCONTENT_URL:"https://frame.fixture.invalid",NUDGE_SECRET:"owned-fixture-secret",S3_ENDPOINT:"https://s3.fixture.invalid",S3_REGION:"garage",S3_BUCKET:"owned-private",S3_ACCESS_KEY:"owned-access",S3_SECRET_KEY:"owned-secret"};
const context=()=>{const db=new Database(":memory:");databases.push(db);return {id:{name:PAGE},waitUntil(){},getWebSockets:()=>[],storage:{sql:{exec(query,...values){const rows=db.query(query).all(...values);return {toArray:()=>rows,[Symbol.iterator]:()=>rows[Symbol.iterator]()};}}}};};
const manifest={v:1,pageId:PAGE,slug:"fixture",visibility:"org",organizationId:ORG,createdByUserId:USER,sharedVersion:null,latestVersion:1,versions:{"1":{key:"pages/fixture/v1.html",contentType:"text/html"}}};
const events=[];let currentManifest=manifest;
const pageStub={async setName(){},async readManifest(){events.push(["manifest"]);return currentManifest;},async apply(request){events.push(["apply",request]);return {ok:true,op:request.op,cleared:2};},async manifestChanged(){events.push(["changed"]);},async fetch(url,options){events.push(["page-socket",url,options]);return new Response("page socket");}};
const orgStub={async setName(){},async nudge(...args){events.push(["nudge",...args]);},async fetch(url,options){events.push(["org-socket",url,options]);return new Response("org socket");}};
const namespace=(stub)=>({idFromName(name){events.push(["id",name]);return name;},get(){return stub;}});
const request=(path,options={})=>worker.fetch(new Request("https://realtime.fixture.invalid"+path,options),{...env,OrgHub:namespace(orgStub),PageHub:namespace(pageStub)},{waitUntil(){},passThroughOnException(){}});
beforeEach(()=>{calls.length=0;events.length=0;closed.length=0;storageStatus=200;storageBody=JSON.stringify(manifest);currentManifest=manifest;});
test("instrumented OrgHub/default exports retain exact identity and hibernation",()=>{expect(OrgHub).toBe(bundle.OrgHub);expect(worker).toBe(bundle.default);expect(PageHub.options).toEqual({hibernate:true});expect(Object.getPrototypeOf(PageHub)).toBe(bundle.PageHub);});
test("genuine PageHub reads signed private manifest from its own constructor",async()=>{const original={...env,PRIVATE:{get:deny}};const hub=new PageHub(context(),original);expect(await hub.readManifest()).toEqual(manifest);expect(original.PRIVATE.get).toBe(deny);expect(calls).toHaveLength(1);expect(calls[0].url).toBe("https://s3.fixture.invalid/owned-private/pages/"+PAGE+"/manifest.json");expect(calls[0].options.redirect).toBe("manual");expect(calls[0].options.headers.Authorization).toContain("Credential=owned-access/");expect(await hub.readManifest()).toEqual(manifest);expect(calls).toHaveLength(1);});
test("missing or malformed manifest returns absent and storage errors refuse",async()=>{const hub=new PageHub(context(),env);storageStatus=404;expect(await hub.readManifest(true)).toBeNull();storageStatus=200;storageBody="damaged";expect(await hub.readManifest(true)).toBeNull();storageStatus=503;await expect(hub.readManifest(true)).rejects.toThrow("usercontent storage returned 503");storageStatus=302;await expect(hub.readManifest(true)).rejects.toThrow("usercontent storage returned 302");});
test("independent constructors retain their own bucket and credentials",async()=>{const first=new PageHub(context(),env),second=new PageHub(context(),{...env,S3_BUCKET:"other-private",S3_ACCESS_KEY:"other-access"});await first.readManifest();await second.readManifest();expect(calls[0].url).toContain("/owned-private/");expect(calls[0].options.headers.Authorization).toContain("Credential=owned-access/");expect(calls[1].url).toContain("/other-private/");expect(calls[1].options.headers.Authorization).toContain("Credential=other-access/");});
test("incomplete storage refuses at constructor before external calls",()=>{expect(()=>new PageHub(context(),{...env,S3_SECRET_KEY:""})).toThrow("usercontent storage missing secret");expect(calls).toEqual([]);});
const connect=async(hub,nonce="owned-nonce",origin="https://"+PAGE+".frame.fixture.invalid",userId=USER,organizationIds=[ORG])=>{const sent=[],refusals=[];const connection={state:null,setState(value){this.state=value;},send(value){sent.push(JSON.parse(value));},close(code,reason){refusals.push({code,reason});}};await hub.onConnect(connection,{request:new Request("https://realtime.fixture.invalid/subscribe",{headers:{origin,"x-superset-page-claims":JSON.stringify({userId,name:"Ada",image:null,organizationIds,nonce})}})});return {connection,sent,refusals};};
test("genuine PageHub connection pins writable viewer and consumes nonce in real local SQLite",async()=>{const hub=new PageHub(context(),env);const first=await connect(hub);expect(first.refusals).toEqual([]);expect(first.connection.state.writable).toBe(true);expect(first.connection.state.author).toBe(true);expect(first.sent[0].type).toBe("hello");const second=await connect(hub);expect(second.refusals).toEqual([{code:4401,reason:"ticket spent"}]);expect(second.sent).toEqual([]);});
test("genuine PageHub refuses wrong frame origin before storage access",async()=>{const hub=new PageHub(context(),env);expect((await connect(hub,"nonce","https://other.frame.fixture.invalid")).refusals).toEqual([{code:4403,reason:"origin"}]);expect(calls).toEqual([]);});
test("genuine PageHub refuses unreadable manifest and derives genuine member permissions",async()=>{const hub=new PageHub(context(),env);expect((await connect(hub,"outside",undefined,"outside",[])).refusals).toEqual([{code:4403,reason:"forbidden"}]);const member=await connect(hub,"member",undefined,"member",[ORG]);expect(member.refusals).toEqual([]);expect(member.connection.state.author).toBe(false);expect(member.connection.state.writable).toBe(true);});
test("genuine health and upgrade requirement routes remain unchanged",async()=>{expect(await (await request("/health")).json()).toEqual({ok:true});expect((await request("/v2/org/"+ORG+"/nudges")).status).toBe(426);expect((await request("/v2/page/"+PAGE+"/storage/socket")).status).toBe(426);expect(events).toEqual([]);});
test("genuine nudge route refuses missing secret and dispatches known kind",async()=>{const body=JSON.stringify({organizationId:ORG,kind:"hosts"});expect((await request("/v2/nudge",{method:"POST",body})).status).toBe(401);expect(events).toEqual([]);const response=await request("/v2/nudge",{method:"POST",headers:{authorization:"Bearer "+env.NUDGE_SECRET},body});expect(response.status).toBe(200);expect(events.some(e=>e[0]==="nudge"&&e[1]==="hosts")).toBe(true);});
test("genuine admin and manifest-change routes preserve secret and page binding",async()=>{const path="/v2/page/"+PAGE+"/storage/";expect((await request(path+"admin",{method:"POST",body:'{"op":"clear"}'})).status).toBe(401);expect((await request(path+"manifest-changed",{method:"POST"})).status).toBe(401);expect(events).toEqual([]);const headers={authorization:"Bearer "+env.NUDGE_SECRET};expect(await (await request(path+"admin",{method:"POST",headers,body:'{"op":"clear"}'})).json()).toEqual({ok:true,op:"clear",cleared:2});expect((await request(path+"manifest-changed",{method:"POST",headers})).status).toBe(200);expect(events.filter(e=>e[0]==="id").map(e=>e[1])).toEqual([PAGE,PAGE]);expect(events.some(e=>e[0]==="changed")).toBe(true);});
test("genuine org JWT membership gates the unchanged namespace subscription",async()=>{expect((await request("/v2/org/"+ORG+"/nudges",{headers:{Upgrade:"websocket"}})).status).toBe(101);expect(closed.at(-1).code).toBe(4401);expect((await request("/v2/org/"+ORG+"/nudges",{headers:{Upgrade:"websocket",authorization:"Bearer "+await claims([])}})).status).toBe(101);expect(closed.at(-1).code).toBe(4403);expect(events).toEqual([]);const response=await request("/v2/org/"+ORG+"/nudges",{headers:{Upgrade:"websocket",authorization:"Bearer "+await claims()}});expect(await response.text()).toBe("org socket");expect(events[0]).toEqual(["id",ORG]);});
test("genuine ticket route retains JWT, missing manifest and membership refusals",async()=>{const path="/v2/page/"+PAGE+"/storage/ticket";expect((await request(path,{method:"POST"})).status).toBe(401);expect(events).toEqual([]);const headers={authorization:"Bearer "+await claims([])};expect((await request(path,{method:"POST",headers})).status).toBe(403);currentManifest=null;expect((await request(path,{method:"POST",headers})).status).toBe(404);});
test("genuine signed ticket reaches socket with original origin and verified claims",async()=>{const token=await claims();const result=await (await request("/v2/page/"+PAGE+"/storage/ticket",{method:"POST",headers:{authorization:"Bearer "+token}})).json();expect(typeof result.ticket).toBe("string");events.length=0;const origin="https://"+PAGE+".frame.fixture.invalid";const response=await request("/v2/page/"+PAGE+"/storage/socket?ticket="+encodeURIComponent(result.ticket),{headers:{Upgrade:"websocket",origin}});expect(await response.text()).toBe("page socket");const headers=events.find(e=>e[0]==="page-socket")[2].headers;expect(headers.get("origin")).toBe(origin);const pinned=JSON.parse(headers.get("x-superset-page-claims"));expect(pinned.userId).toBe(USER);expect(pinned.organizationIds).toEqual([ORG]);expect(typeof pinned.nonce).toBe("string");events.length=0;await request("/v2/page/other-page/storage/socket?ticket="+encodeURIComponent(result.ticket),{headers:{Upgrade:"websocket",origin}});expect(closed.at(-1).code).toBe(4401);expect(events).toEqual([]);});
`,
		);
		const child = spawnSync(
			process.execPath,
			["--no-env-file", "test", join(root, "fixture.test.ts")],
			{
				cwd: root,
				env: { PATH: "/usr/bin:/bin", TMPDIR: root },
				encoding: "utf8",
				timeout: 15_000,
				maxBuffer: 128 * 1024,
			},
		);
		process.stdout.write(child.stdout);
		process.stderr.write(child.stderr);
		if (child.error) throw child.error;
		expect(child.status).toBe(0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
