import { expect, test } from "bun:test";
import path from "node:path";

const cwd = path.resolve(import.meta.dir, "../..");
for (const key of [
	undefined,
	"",
	"build",
	"unused",
	"phc_local_dev_disabled",
	"phc_test_configured",
]) {
	test(`mobile starts with ${String(key)} using the real React Native SDK`, () => {
		const script = `import { mock } from "bun:test";
   import assert from "node:assert/strict";
   import path from "node:path";
   const sdk = path.resolve("node_modules/posthog-react-native/dist");
   const listener = () => ({ remove() {} });
   mock.module(Bun.resolveSync("react-native", process.cwd()), () => ({ Platform: { OS: "ios" }, Dimensions: { get: () => ({ width: 390, height: 844 }) }, AppState: { currentState: "active", addEventListener: listener }, Linking: { getInitialURL: async () => null, addEventListener: listener } }));
   mock.module(path.join(sdk, "native-deps.js"), () => ({ getAppProperties: () => ({}), buildOptimisticAsyncStorage: () => ({ getItem: () => null, setItem() {}, flush: async () => {} }) }));
   mock.module(path.join(sdk, "optional/OptionalPlugin.js"), () => ({ OptionalPlugin: undefined }));
   const { PostHog } = await import(path.join(sdk, "posthog-rn.js"));
   const { useFeatureFlag: sdkFeatureFlag } = await import(path.join(sdk, "hooks/useFeatureFlag.js"));
   const { usePostHog: sdkUsePostHog } = await import(path.join(sdk, "hooks/usePostHog.js"));
   mock.module(Bun.resolveSync("posthog-react-native", process.cwd()), () => ({ PostHog, useFeatureFlag: sdkFeatureFlag, usePostHog: sdkUsePostHog }));
   mock.module(path.resolve("lib/env.ts"), () => ({ env: { EXPO_PUBLIC_POSTHOG_KEY: ${JSON.stringify(key)}, EXPO_PUBLIC_POSTHOG_HOST: "https://analytics.example.invalid", NODE_ENV: "test" } }));
   global.fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
   const { posthog } = await import(path.resolve("lib/posthog/client.ts"));
   const hooks = await import(path.resolve("lib/posthog/hooks.ts"));
   if (${JSON.stringify(key)} === "phc_test_configured") {
    assert.equal(hooks.useFeatureFlag, sdkFeatureFlag);
    assert.equal(hooks.usePostHog, sdkUsePostHog);
    assert.ok(posthog instanceof PostHog);
    assert.equal(posthog.host, "https://analytics.example.invalid");
    assert.equal(posthog._enableSessionReplay, true);
    posthog.updateFlags({"cloud-workspaces":true});
    mock.module(path.resolve("lib/auth/client.ts"),()=>({useSession:()=>({data:{session:{activeOrganizationId:"owned-disposable-org"}}})}));
    mock.module(path.resolve("lib/trpc/client.ts"),()=>({apiClient:{environment:{list:{query:async()=>[]}}}}));
    const React=await import("react");
    const {renderToString}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../../../desktop/node_modules/react-dom/server"))});
    const {PostHogContext}=await import(path.join(sdk,"PostHogContext.js"));
    const {QueryClient,QueryClientProvider}=await import("@tanstack/react-query");
    const {useCloudEnvironments}=await import(path.resolve("hooks/useCloudEnvironments/useCloudEnvironments.ts"));
    const queryClient=new QueryClient();
    function Probe(){return React.createElement("span",null,useCloudEnvironments().fetchStatus)}
    assert.equal(renderToString(React.createElement(PostHogContext.Provider,{value:{client:posthog}},React.createElement(QueryClientProvider,{client:queryClient},React.createElement(Probe)))),"<span>fetching</span>");
    queryClient.clear();
   } else {
    assert.equal(posthog instanceof PostHog, false);
    assert.equal(posthog.capture("event"), undefined);
    assert.equal(posthog.screen("/"), undefined);
    assert.equal(posthog.identify("user"), undefined);
    assert.equal(posthog.reset(), undefined);
    assert.equal(hooks.useFeatureFlag("cloud"), undefined);
    assert.equal(hooks.usePostHog().capture("app_review_prompt_requested"), undefined);
    let requests=0;
    const warnings=[];
    console.warn=(...args)=>warnings.push(args);
    mock.module(path.resolve("lib/auth/client.ts"),()=>({useSession:()=>({data:{session:{activeOrganizationId:"owned-disposable-org"}}})}));
    mock.module(path.resolve("lib/trpc/client.ts"),()=>({apiClient:{environment:{list:{query:()=>{requests++;throw Error("Unexpected cloud query")}}}}}));
    const React=await import("react");
    const {renderToString}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../../../desktop/node_modules/react-dom/server"))});
    const {QueryClient,QueryClientProvider}=await import("@tanstack/react-query");
    const {useCloudEnvironments}=await import(path.resolve("hooks/useCloudEnvironments/useCloudEnvironments.ts"));
    const queryClient=new QueryClient();
    function Probe(){const result=useCloudEnvironments();return React.createElement("span",null,result.fetchStatus)}
    assert.equal(renderToString(React.createElement(QueryClientProvider,{client:queryClient},React.createElement(Probe))),"<span>idle</span>");
    assert.equal(requests,0);assert.deepEqual(warnings,[]);queryClient.clear();
   }
   await posthog.shutdown();`;
		const result = Bun.spawnSync([process.execPath, "-e", script], {
			cwd,
			env: { PATH: process.env.PATH, NODE_ENV: "test" },
			stdout: "pipe",
			stderr: "pipe",
			timeout: 5000,
		});
		expect(result.stderr.toString()).toBe("");
		expect(result.exitCode).toBe(0);
	});
}
