import { expect, test } from "bun:test";

test("Authentik last-used state survives a route remount and uses the existing badge", () => {
	const cwd = new URL("../../../../", import.meta.url).pathname;
	const script = `
import {mock} from "bun:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToString} from "react-dom/server";
let stored="authentik";const reads=[];
globalThis.window={localStorage:{getItem:(key)=>{reads.push(key);return stored},setItem:()=>{}},addEventListener:()=>{},removeEventListener:()=>{}};
Object.defineProperty(globalThis,"navigator",{value:{onLine:true},configurable:true});
mock.module("@lingui/react/macro",()=>({Trans:({children})=>children}));
mock.module("@tanstack/react-router",()=>({createFileRoute:()=>options=>({options}),useNavigate:()=>async()=>{},useRouter:()=>({})}));
mock.module(${JSON.stringify(new URL("../../../../src/renderer/env.renderer.ts", import.meta.url).pathname)},()=>({env:{NODE_ENV:"production",NEXT_PUBLIC_AUTH_PROVIDERS:"authentik",SKIP_ENV_VALIDATION:false}}));
mock.module(${JSON.stringify(new URL("../../../../src/renderer/lib/auth-client.ts", import.meta.url).pathname)},()=>({authClient:{useSession:()=>({data:null,isPending:false,refetch:async()=>{}})},getAuthToken:()=>null,setAuthToken:()=>{}}));
mock.module(${JSON.stringify(new URL("../../../../src/renderer/lib/electron-trpc.ts", import.meta.url).pathname)},()=>({electronTrpc:{auth:{signIn:{useMutation:()=>({isPending:false,mutate:()=>{}})},persistToken:{useMutation:()=>({mutateAsync:async()=>{}})}}}}));
mock.module("posthog-js/dist/module.full.no-external",()=>({default:{capture:()=>{}}}));
const {Route}=await import(${JSON.stringify(new URL("./page.tsx", import.meta.url).pathname)});
for(const value of ["authentik","github","unsupported"]) {
 stored=value;
 const html=renderToString(React.createElement(Route.options.component));
 const buttons=[...html.matchAll(new RegExp("<button[^>]*>.*?</button>","gs"))].map(match=>match[0]);
 const authentik=buttons.find(button=>button.includes("Continue with Authentik"));
 assert.ok(authentik);
 assert.equal(authentik.includes("Last used"),value==="authentik");
 assert.equal(buttons.filter(button=>button.includes("Last used")).length,value==="unsupported"?0:1);
}
assert.deepEqual(reads,["superset-last-auth-method","superset-last-auth-method","superset-last-auth-method"]);
`;
	const result = Bun.spawnSync(
		[process.execPath, "--no-env-file", "-e", script],
		{
			cwd,
			env: { PATH: process.env.PATH, NODE_ENV: "test" },
			stdout: "pipe",
			stderr: "pipe",
			timeout: 5000,
		},
	);
	expect(
		result.stderr
			.toString()
			.split("\n")
			.filter(
				(line) =>
					line &&
					!line.startsWith("React expects the `children` prop of <title> tags"),
			),
	).toEqual([]);
	expect(result.exitCode).toBe(0);
});
