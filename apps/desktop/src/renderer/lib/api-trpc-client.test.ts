import { afterEach, expect, mock, test } from "bun:test";
import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import { setCloudOrganizationId } from "./cloudRequestContext";

let authToken: string | null = "test-token";

mock.module("renderer/env.renderer", () => ({
	env: { NEXT_PUBLIC_API_URL: "https://api.example.test" },
}));
mock.module("./auth-client", () => ({
	getAuthToken: () => authToken,
}));

const { apiTrpcClient } = await import("./api-trpc-client");
const { cloudTrpcClient } = await import("./cloud-trpc");
const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	setCloudOrganizationId(null);
	authToken = "test-token";
});

test("automation and billing mutations follow the window organization on every request", async () => {
	const requests: Headers[] = [];
	globalThis.fetch = Object.assign(
		async (
			_input: Parameters<typeof fetch>[0],
			init?: Parameters<typeof fetch>[1],
		) => {
			requests.push(new Headers(init?.headers));
			return Response.json([
				{ result: { data: { json: { id: "automation" } } } },
			]);
		},
		{ preconnect: originalFetch.preconnect },
	);

	for (const organizationId of ["paid-org", "other-org", null]) {
		setCloudOrganizationId(organizationId);
		await apiTrpcClient.automation.create.mutate({
			name: "Untitled",
			prompt: "",
			agent: "claude",
			triggers: [],
		});
		await apiTrpcClient.automation.runNow.mutate({ id: "automation" });
		await apiTrpcClient.automation.setEnabled.mutate({
			id: "automation",
			enabled: true,
		});
		await apiTrpcClient.billing.portal.mutate({});
	}

	expect(requests.map((headers) => headers.get(ORGANIZATION_HEADER))).toEqual([
		...Array(4).fill("paid-org"),
		...Array(4).fill("other-org"),
		...Array(4).fill(null),
	]);
	for (const headers of requests) {
		expect(headers.get("Authorization")).toBe("Bearer test-token");
	}
});

test("both cloud clients share current authentication and organization headers", async () => {
	const requests: Headers[] = [];
	globalThis.fetch = Object.assign(
		async (
			_input: Parameters<typeof fetch>[0],
			init?: Parameters<typeof fetch>[1],
		) => {
			requests.push(new Headers(init?.headers));
			throw new Error("request captured");
		},
		{ preconnect: originalFetch.preconnect },
	);
	for (const organizationId of ["paid-org", "other-org", null]) {
		setCloudOrganizationId(organizationId);
		authToken = organizationId ? `token-${organizationId}` : null;
		await expect(apiTrpcClient.billing.activePlan.query()).rejects.toThrow(
			"request captured",
		);
		await expect(cloudTrpcClient.billing.activePlan.query()).rejects.toThrow(
			"request captured",
		);
		const [imperative, reactive] = requests.slice(-2);
		expect(imperative?.get(ORGANIZATION_HEADER)).toBe(organizationId);
		expect(reactive?.get(ORGANIZATION_HEADER)).toBe(organizationId);
		for (const headers of [imperative, reactive]) {
			expect(headers?.get("Authorization")).toBe(
				authToken ? `Bearer ${authToken}` : null,
			);
			expect(headers?.get("x-superset-client")).toBe(
				window.App?.appVersion ? `desktop/${window.App.appVersion}` : null,
			);
		}
	}
});
