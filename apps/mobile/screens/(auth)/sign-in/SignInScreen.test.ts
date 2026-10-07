import { expect, test } from "bun:test";
import path from "node:path";

const cwd = path.resolve(import.meta.dir, "../../..");
const cases = [
	{ value: undefined, providers: ["apple", "github", "google"] },
	{ value: "", providers: ["apple", "github", "google"] },
	{ value: "  ", providers: ["apple", "github", "google"] },
	{ value: "unknown", providers: [] },
	{ value: "gitlab", providers: ["gitlab"] },
	{ value: "google", providers: ["google"] },
	{ value: "apple", providers: ["apple"] },
	{ value: "github", providers: ["github"] },
	{ value: " GitLab, unknown, gitlab ", providers: ["gitlab"] },
	{
		value: "apple,github,google,gitlab",
		providers: ["apple", "github", "google", "gitlab"],
	},
] as const;
for (const { value: providers, providers: enabled } of cases) {
	const expanded = enabled.length === 4;

	test(`mobile actions match native capabilities for ${JSON.stringify(providers) ?? "hosted defaults"}`, () => {
		const script = `
import {mock} from "bun:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToString} from ${JSON.stringify(path.resolve(cwd, "../desktop/node_modules/react-dom/server"))};
globalThis.__DEV__=${expanded};
mock.module(${JSON.stringify(path.join(cwd, "assets/icon.png"))},()=>({default:1}));
const buttons=[],calls=[],scrolls=[],appleRequests=[];
const host=(props)=>React.createElement("span",null,props.children);
mock.module("react-native",()=>({View:host,Text:host,ScrollView:(props)=>{scrolls.push(props);return host(props)},Image:()=>null,useColorScheme:()=>"dark",Platform:{OS:"ios",select:()=>undefined},Pressable:(props)=>{buttons.push(props);return React.createElement("button",null,props.children)},Alert:{alert:()=>{}},Linking:{openURL:async()=>{}}}));
mock.module("react-native-svg",()=>({default:host,Path:()=>null}));
mock.module("@rn-primitives/slot",()=>({Slot:{Text:host}}));
mock.module("@superset/alert-prompt",()=>({prompt:async()=>null}));
mock.module("expo-network",()=>({}));
mock.module("expo-apple-authentication",()=>({AppleAuthenticationScope:{FULL_NAME:0,EMAIL:1},signInAsync:async(input)=>{appleRequests.push(input);return{identityToken:"disposable-device-token"}}}));
mock.module("expo-crypto",()=>({randomUUID:()=>"owned-nonce",CryptoDigestAlgorithm:{SHA256:"sha256"},digestStringAsync:async()=>"owned-hash"}));
mock.module("@lingui/core/macro",()=>({msg:(descriptor)=>descriptor}));
mock.module("@lingui/react/macro",()=>({Trans:host,useLingui:()=>({t:({message})=>message})}));
mock.module("dotenv",()=>({config:()=>({parsed:{}})}));
mock.module(${JSON.stringify(path.join(cwd, "lib/env.ts"))},()=>({env:{EXPO_PUBLIC_AUTH_PROVIDERS:${JSON.stringify(providers)},EXPO_PUBLIC_E2E:"0"}}));
mock.module(${JSON.stringify(path.join(cwd, "lib/auth/client.ts"))},()=>({authClient:{},signUp:{},signIn:{social:async(input)=>{calls.push(input);return{}},oauth2:async(input)=>{calls.push(input);return{}}}}));
const {SignInScreen}=await import(${JSON.stringify(path.join(import.meta.dir, "SignInScreen.tsx"))});
const html=renderToString(React.createElement(SignInScreen));
const {default:appConfig}=await import(${JSON.stringify(path.join(cwd, "app.config.ts"))});
const config=appConfig({config:{}});
assert.equal(config.scheme,"superset");
assert.equal(config.ios.usesAppleSignIn,${enabled.some((provider) => provider === "apple")});
assert.equal(buttons.length,${enabled.length + (expanded ? 2 : 0)});
assert.equal(html.includes("Sign in with email"),true);
assert.equal(scrolls.length,1);assert.equal(scrolls[0].contentContainerStyle.flexGrow,1);assert.equal(scrolls[0].keyboardShouldPersistTaps,"handled");assert.equal(scrolls[0].contentInsetAdjustmentBehavior,"automatic");
const enabled=${JSON.stringify(enabled)};
const labels={apple:"Apple",github:"GitHub",google:"Google",gitlab:"GitLab"};
for(const [provider,name] of Object.entries(labels)) assert.equal(html.includes("Continue with "+name),enabled.includes(provider));
for(let index=0;index<enabled.length;index++) {
 await buttons[index].onPress();
 assert.deepEqual(calls[index],enabled[index]==="apple"?{
  provider:"apple",callbackURL:"/",idToken:{token:"disposable-device-token",nonce:"owned-nonce",user:{name:{firstName:undefined,lastName:undefined},email:undefined}}
 }:{provider:enabled[index],callbackURL:"/"});
}
assert.equal(calls.length,enabled.length);
assert.deepEqual(appleRequests,enabled.includes("apple")?[{requestedScopes:[0,1],nonce:"owned-hash"}]:[]);

`;
		const result = Bun.spawnSync(
			[process.execPath, "--no-env-file", "-e", script],
			{
				cwd,
				env: {
					PATH: process.env.PATH,
					NODE_ENV: "test",
					...(providers ? { EXPO_PUBLIC_AUTH_PROVIDERS: providers } : {}),
				},
				stdout: "pipe",
				stderr: "pipe",
				timeout: 5000,
			},
		);
		expect(result.stderr.toString()).toBe("");
		expect(result.exitCode).toBe(0);
	});
}
