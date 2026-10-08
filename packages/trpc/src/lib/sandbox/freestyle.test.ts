import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Freestyle } from "freestyle";
import { setTestEnv } from "../../../test/env";
import { createFreestyleProvider, credentialRules } from "./freestyle";
import type { SandboxClaim, SandboxNetworkPolicy } from "./types";

setTestEnv({ FREESTYLE_SANDBOX_FORWARD_AUTH_ID: "fa-test" });
afterEach(() => {
	spyOn(globalThis, "fetch").mockRestore();
});
const workspace = "11111111-2222-4333-8444-555555555555";
const policy: SandboxNetworkPolicy = {
	allow: {
		"*": [],
		"api.openai.com": [
			{
				match: {
					headers: [
						{
							key: { exact: "authorization" },
							value: { exact: "Bearer placeholder" },
						},
					],
				},
				transform: [{ headers: { authorization: "Bearer real-key" } }],
			},
		],
	},
};
const claim = {
	identity: {
		SUPERSET_SANDBOX_CONTRACT: "1",
		SUPERSET_API_URL: "https://api.example",
		SUPERSET_SANDBOX_WORKSPACE_ID: workspace,
		SUPERSET_SANDBOX_ORGANIZATION_ID: workspace,
		SUPERSET_SANDBOX_REPOSITORIES: "[]",
		SUPERSET_SANDBOX_IMAGE_TAG: "sh-base",
		SUPERSET_SANDBOX_PROVIDER: "freestyle",
	},
	hostSecret: "host-secret",
	managedEnv: { OPENAI_API_KEY: "placeholder" },
	networkPolicy: policy,
} as SandboxClaim;

type Call = { path: string; method: string; body: Record<string, unknown> };
function harness(
	options: { paused?: boolean; rejectPolicy?: boolean; missing?: boolean } = {},
) {
	const calls: Call[] = [];
	const states = new Map<string, string>([
		["vm-source", options.paused ? "paused" : "running"],
	]);
	const existingRules = [
		{
			id: "tls-old",
			domain: "api.openai.com",
			protocol: "http",
			source: { vmId: "vm-source" },
			destination: { public: true },
		},
	];
	const transport = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const url = new URL(String(input));
		const path = url.pathname;
		const method = init?.method ?? "GET";
		const body =
			init?.body && !path.includes("/fs/") ? JSON.parse(String(init.body)) : {};
		calls.push({ path, method, body });
		if (options.missing)
			return Response.json(
				{ code: "NOT_FOUND", message: "gone" },
				{ status: 404 },
			);
		if (path === "/v5/tls" && method === "GET")
			return Response.json({
				rules: existingRules,
				totalCount: existingRules.length,
			});
		if (path.startsWith("/v5/tls") && method !== "GET")
			return Response.json(
				{ id: "tls-new" },
				{ status: options.rejectPolicy ? 400 : 200 },
			);
		if (path === "/v5/firewall/rules" && method === "GET")
			return Response.json({ rules: [], totalCount: 0 });
		if (path === "/v5/firewall/rules") return Response.json({ id: "fw-new" });
		if (path === "/v5/snapshots/golden" && method === "GET")
			return Response.json(
				{ code: "NOT_FOUND", message: "gone" },
				{ status: 404 },
			);
		if (path.startsWith("/v5/snapshots/"))
			return new Response(null, { status: 204 });
		if (path === "/v5/vms" && method === "POST") {
			states.set("vm-clone", "running");
			return Response.json({ id: "vm-clone", state: "running", metadata: {} });
		}
		const id = path.split("/")[3] ?? "";
		if (path.endsWith("/start")) states.set(id, "running");
		if (path.endsWith("/pause")) states.set(id, "paused");
		if (path.endsWith("/exec-await")) {
			if (body.command === "systemctl poweroff") states.set(id, "stopped");
			return Response.json({ statusCode: 0 });
		}
		if (path.endsWith("/snapshot"))
			return Response.json({
				snapshotId: id === "vm-source" ? "sh-staging" : "sh-golden",
			});
		if (method === "DELETE") return new Response(null, { status: 204 });
		if (path.includes("/fs/")) return new Response(null, { status: 204 });
		return Response.json({
			id,
			state: states.get(id),
			metadata: { workspace },
			totalRunSeconds: 20_000,
		});
	}) as typeof fetch;
	const client = new Freestyle({ apiKey: "test", fetch: transport });
	return { calls, provider: createFreestyleProvider(client), states };
}

describe("Freestyle lifecycle", () => {
	test("reading a paused address does not wake it", async () => {
		const h = harness({ paused: true });
		expect((await h.provider.describeSandbox("vm-source")).running).toBe(false);
		expect(h.calls.map((call) => call.method)).toEqual(["GET"]);
	});
	test("sleep preserves RAM with pause rather than allocating a template snapshot", async () => {
		const h = harness();
		await h.provider.sleepSandbox("vm-source");
		expect(h.states.get("vm-source")).toBe("paused");
		expect(h.calls.some((call) => call.path.endsWith("/snapshot"))).toBe(false);
	});
	test("wake refreshes exact credential matches before resuming and extends an exhausted budget", async () => {
		spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
		const h = harness({ paused: true });
		await h.provider.wakeSandbox({ providerSandboxId: "vm-source", claim });
		const replacement = h.calls.find((call) => call.path === "/v5/tls/tls-old");
		expect(replacement?.method).toBe("PUT");
		expect(replacement?.body.match).toEqual(
			policy === "allow-all"
				? null
				: policy.allow["api.openai.com"]?.[0]?.match,
		);
		if (!replacement) throw new Error("No credential replacement");
		expect(h.calls.indexOf(replacement)).toBeLessThan(
			h.calls.findIndex((call) => call.path.endsWith("/start")),
		);
		expect(
			h.calls.find((call) => call.method === "PATCH")?.body.maxRunTotalSeconds,
		).toBe(34_400);
		expect(h.calls.some((call) => call.path.endsWith("/exec-await"))).toBe(
			false,
		);
	});
	test("a rejected placeholder matcher leaves egress closed and never boots the workload", async () => {
		const h = harness({ rejectPolicy: true });
		await expect(
			h.provider.provisionSandbox({
				name: "vm-source",
				environment: {
					sourceKind: "image",
					sourceRef: "sh-base",
					region: "default",
				},
				claim,
			}),
		).rejects.toThrow("header-match support must be deployed");
		expect(
			h.calls.some(
				(call) => call.path === "/v5/firewall/rules" && call.method === "POST",
			),
		).toBe(false);
		expect(h.calls.some((call) => call.path.endsWith("/exec-await"))).toBe(
			false,
		);
	});
	test("promotion cold boots a disposable clone after stripping identity and cleans temporary resources", async () => {
		const h = harness();
		const result = await h.provider.promoteSandboxToEnvironment({
			sourceSandbox: "vm-source",
			goldenName: "golden",
			claim,
		});
		expect(result.goldenName).toBe("sh-golden");
		expect(h.states.get("vm-source")).toBe("running");
		const clone = h.calls.filter((call) =>
			call.path.startsWith("/v5/vms/vm-clone"),
		);
		const strip = clone.findIndex((call) =>
			String(call.body.command).startsWith("rm -rf"),
		);
		const snapshot = clone.findIndex((call) => call.path.endsWith("/snapshot"));
		expect(strip).toBeGreaterThan(0);
		expect(
			clone
				.slice(strip + 1, snapshot)
				.some((call) => call.body.command === "systemctl poweroff"),
		).toBe(true);
		expect(
			clone
				.slice(strip + 1, snapshot)
				.some((call) => call.path.endsWith("/start")),
		).toBe(true);
		expect(
			h.calls.some(
				(call) => call.path === "/v5/vms/vm-clone" && call.method === "DELETE",
			),
		).toBe(true);
		expect(
			h.calls.some(
				(call) =>
					call.path === "/v5/snapshots/sh-staging" && call.method === "DELETE",
			),
		).toBe(true);
		expect(
			h.calls.some((call) => call.path === "/v5/vms/vm-source/exec-await"),
		).toBe(false);
	});
	test("environment cleanup deletes a snapshot", async () => {
		const h = harness();
		await h.provider.deleteEnvironment("sh-golden");
		expect(h.calls.map((call) => call.path)).toEqual([
			"/v5/snapshots/sh-golden",
		]);
	});
	test("missing workspace deletion is idempotent", async () => {
		await harness({ missing: true }).provider.deleteSandbox("gone");
	});
	test("credential keepalive does not revive or fail a missing workspace", async () => {
		expect(
			await harness({ missing: true }).provider.applySandboxPolicy({
				providerSandboxId: "gone",
				networkPolicy: policy,
			}),
		).toBe("not-running");
	});
	test("unsupported restrictive policies fail before granting broad Internet access", () => {
		expect(() => credentialRules({ allow: { "api.openai.com": [] } })).toThrow(
			"catch-all",
		);
	});
});
