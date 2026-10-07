import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

test("retained actual usercontent wrapper and original page/file/ticket routes", () => {
	const root = mkdtempSync("/tmp/superset-usercontent-entry-");
	try {
		for (const file of ["usercontent-entry.js", "s3-bucket.js"])
			copyFileSync(join(import.meta.dirname, file), join(root, file));
		writeFileSync(
			join(root, "index.js"),
			`export {default} from ${JSON.stringify(resolve(import.meta.dirname, "../../apps/usercontent/src/index.ts"))};`,
		);
		writeFileSync(
			join(root, "fixture.test.ts"),
			`
import {beforeEach,expect,mock,spyOn,test} from "bun:test";
const deny=()=>{throw Error("Unexpected external or native operation")};const cp=await import("node:child_process");for(const k of ["spawn","spawnSync","exec","execSync","execFile","execFileSync"])spyOn(cp,k).mockImplementation(deny);spyOn(Bun,"spawn").mockImplementation(deny);spyOn(Bun,"spawnSync").mockImplementation(deny);const net=await import("node:net");spyOn(net.Socket.prototype,"connect").mockImplementation(deny);mock.module("dotenv",()=>({config:deny}));
const PAGE="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",FILE="ffffffff-1111-2222-3333-444444444444";
const current="owned-current-token-secret-32-characters",previous="owned-previous-token-secret-32-characters";
const env={USERCONTENT_URL:"https://frame.fixture.invalid",MEDIA_URL:"https://media.fixture.invalid",APP_URL:"https://app.fixture.invalid",REALTIME_URL:"https://realtime.fixture.invalid",FRAME_ANCESTORS:"https://app.fixture.invalid file:",USERCONTENT_TOKEN_SECRET:current,S3_ENDPOINT:"https://s3.fixture.invalid",S3_BUCKET:"owned-private",S3_ACCESS_KEY:"owned-access",S3_SECRET_KEY:"owned-secret"};
const manifest={v:1,pageId:PAGE,slug:"fixture",visibility:"everyone",sharedVersion:1,latestVersion:2,versions:{"1":{key:"pages/"+PAGE+"/versions/1/index.html",contentType:"text/html"},"2":{key:"pages/"+PAGE+"/versions/2/index.html",contentType:"text/html"}}};
const objects=new Map(),calls=[],cache=new Map();globalThis.caches={default:{async match(request){return cache.get(request.url)?.clone();},async put(request,response){cache.set(request.url,response);}}};
globalThis.fetch=Object.assign(async(input,options)=>{const url=input instanceof URL?input:new URL(typeof input==="string"?input:input.url);if(url.host!=="s3.fixture.invalid")return deny();calls.push({url:url.href,options});const body=objects.get(decodeURIComponent(url.pathname).replace(/^\\/owned-private\\//,""));if(body===undefined)return new Response(null,{status:404});const bytes=Buffer.from(body);const range=options?.headers?.Range;if(range){const m=/^bytes=(\\d+)-(\\d*)$/.exec(range);if(!m)return new Response(null,{status:416});const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),bytes.length-1):bytes.length-1;if(start>=bytes.length)return new Response(null,{status:416});return new Response(bytes.subarray(start,end+1),{status:206,headers:{"content-range":"bytes "+start+"-"+end+"/"+bytes.length,"content-length":String(end-start+1),"content-type":"text/plain"}});}return new Response(body,{headers:{"content-type":url.pathname.endsWith(".html")?"text/html":"application/json","content-length":String(bytes.length)}});},{preconnect:deny});
const {default:wrapper}=await import("./usercontent-entry.js");const {signPageTicket,signFileTicket}=await import(${JSON.stringify(resolve(import.meta.dirname, "../../packages/shared/src/usercontent/ticket.ts"))});
const fetchPage=(path,headers={},configuration=env)=>wrapper.fetch(new Request("https://"+PAGE+".frame.fixture.invalid"+path,{headers}),configuration,{waitUntil(){},passThroughOnException(){}});
const fetchFile=(path,headers={},configuration=env)=>wrapper.fetch(new Request("https://media.fixture.invalid"+path,{headers}),configuration,{waitUntil(){},passThroughOnException(){}});
const pageTicket=(secret=current,extra={})=>signPageTicket(secret,{pageId:PAGE,version:2,exp:Math.floor(Date.now()/1000)+60,...extra});
beforeEach(()=>{calls.length=0;cache.clear();objects.clear();objects.set("pages/"+PAGE+"/manifest.json",JSON.stringify(manifest));objects.set(manifest.versions["1"].key,"<html><head></head><body>public version</body></html>");objects.set(manifest.versions["2"].key,"<html><head></head><body>private historic version</body></html>");objects.set("files/"+FILE+"/original","file content");});
test("public shared page uses signed private bucket and retains headers/scripts",async()=>{const response=await fetchPage("/");expect(response.status).toBe(200);const body=await response.text();expect(body).toContain("public version");expect(body).not.toContain("private historic");expect(body).toContain("<script");expect(response.headers.get("content-security-policy")).toContain("realtime.fixture.invalid");expect(response.headers.get("cache-control")).toBe("no-cache");expect(response.headers.get("x-content-type-options")).toBe("nosniff");expect(calls[0].url).toBe("https://s3.fixture.invalid/owned-private/pages/"+PAGE+"/manifest.json");expect(calls[0].options.headers.Authorization).toContain("Credential=owned-access/");});
test("anonymous or invalid historic ticket cannot read private version",async()=>{expect((await fetchPage("/versions/2/")).status).toBe(302);expect((await fetchPage("/versions/2/~invalid/")).status).toBe(302);expect(calls.some(c=>c.url.endsWith("/versions/2/index.html"))).toBe(false);});
test("valid page ticket preserves pinned private behavior and ETag revalidation",async()=>{const token=await pageTicket();const response=await fetchPage("/versions/2/~"+token+"/");expect(response.status).toBe(200);expect(await response.text()).toContain("private historic version");expect(response.headers.get("cache-control")).toContain("private, max-age=");expect(response.headers.get("cache-control")).toContain("immutable");const etag=response.headers.get("etag");expect(etag).toBeTruthy();expect((await fetchPage("/versions/2/~"+token+"/",{"if-none-match":etag})).status).toBe(304);});
test("rotation accepts previous secret only when genuinely configured",async()=>{const token=await pageTicket(previous);expect((await fetchPage("/versions/2/~"+token+"/")).status).toBe(302);expect((await fetchPage("/versions/2/~"+token+"/",{},{...env,USERCONTENT_TOKEN_SECRET_PREVIOUS:previous})).status).toBe(200);});
test("wrong-page and expired tickets refuse before private content access",async()=>{const foreign=await pageTicket(current,{pageId:"other-page"}),expired=await pageTicket(current,{exp:Math.floor(Date.now()/1000)-1});expect((await fetchPage("/versions/2/~"+foreign+"/")).status).toBe(302);expect((await fetchPage("/versions/2/~"+expired+"/")).status).toBe(302);expect(calls.some(c=>c.url.endsWith("/versions/2/index.html"))).toBe(false);});
test("raw object history and unlisted assets stay inaccessible",async()=>{expect((await fetchPage("/pages/"+PAGE+"/versions/2/index.html")).status).toBe(404);expect((await fetchPage("/versions/1/arbitrary.html")).status).toBe(404);expect(calls.some(c=>c.url.endsWith("/versions/2/index.html"))).toBe(false);});
test("cached public rendering cannot bypass a removed manifest",async()=>{expect((await fetchPage("/")).status).toBe(200);objects.delete("pages/"+PAGE+"/manifest.json");expect((await fetchPage("/")).status).toBe(404);});
test("anonymous and invalid file tickets refuse before storage",async()=>{expect((await fetchFile("/files/"+FILE)).status).toBe(404);expect((await fetchFile("/files/"+FILE+"?ticket=invalid")).status).toBe(404);expect(calls).toEqual([]);});
test("genuine file ticket preserves bounded ranges and response policy",async()=>{const token=await signFileTicket(current,{fileId:FILE,contentType:"text/plain",exp:Math.floor(Date.now()/1000)+60});const response=await fetchFile("/files/"+FILE+"?ticket="+token,{range:"bytes=0-3"});expect(response.status).toBe(206);expect(await response.text()).toBe("file");expect(response.headers.get("content-range")).toBe("bytes 0-3/12");expect(response.headers.get("x-content-type-options")).toBe("nosniff");expect(response.headers.get("cache-control")).toContain("private");expect((await fetchFile("/files/"+FILE+"?ticket="+token,{range:"bytes=999-1000"})).status).toBe(416);});
test("per-env wrapper bindings preserve storage credentials and original env",async()=>{const supplied={...env,PRIVATE:{get:deny}};expect((await fetchPage("/",{},supplied)).status).toBe(200);expect(supplied.PRIVATE.get).toBe(deny);calls.length=0;objects.set("pages/"+PAGE+"/manifest.json",JSON.stringify(manifest));expect((await fetchPage("/",{},{...env,S3_ACCESS_KEY:"other-access"})).status).toBe(200);expect(calls[0].options.headers.Authorization).toContain("Credential=other-access/");});
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
