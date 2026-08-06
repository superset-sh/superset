import { describe, expect, test } from "bun:test";
import { buildUpstreamUrl } from "./electric";
import type { Env } from "./types";

const env = {
	AUTH_URL: "https://app.example",
	ELECTRIC_SECRET: "server-secret",
	ELECTRIC_SHAPE_URL: "https://electric.example/v1/shape",
} satisfies Env;

describe("buildUpstreamUrl", () => {
	test("forwards only Electric protocol parameters from the client URL", () => {
		const clientUrl = new URL(
			"https://proxy.example/shape?table=tasks&organizationId=org-1&handle=client-handle&offset=123&where=malicious&secret=client-secret&columns=*",
		);
		const upstream = buildUpstreamUrl(
			clientUrl,
			"tasks",
			{ fragment: '"organization_id" = $1', params: ["org-1"] },
			env,
		);

		expect(upstream.origin).toBe("https://electric.example");
		expect(upstream.searchParams.get("table")).toBe("tasks");
		expect(upstream.searchParams.get("where")).toBe('"organization_id" = $1');
		expect(upstream.searchParams.get("params[1]")).toBe("org-1");
		expect(upstream.searchParams.get("secret")).toBe("server-secret");
		expect(upstream.searchParams.get("handle")).toBe("client-handle");
		expect(upstream.searchParams.get("offset")).toBe("123");
		expect(upstream.searchParams.getAll("columns")).toEqual([]);
	});

	test("restricts sensitive columns for API keys", () => {
		const upstream = buildUpstreamUrl(
			new URL("https://proxy.example/shape"),
			"auth.apikeys",
			{ fragment: '"organization_id" = $1', params: ["org-1"] },
			env,
		);

		expect(upstream.searchParams.get("columns")).toBe(
			"id,name,start,created_at,last_request",
		);
	});

	test("uses Electric source credentials when both source values are configured", () => {
		const upstream = buildUpstreamUrl(
			new URL("https://proxy.example/shape"),
			"tasks",
			{ fragment: '"organization_id" = $1', params: ["org-1"] },
			{
				AUTH_URL: "https://app.example",
				ELECTRIC_SECRET: "fallback-secret",
				ELECTRIC_SHAPE_URL: "https://electric.example/v1/shape",
				ELECTRIC_SOURCE_ID: "source-id",
				ELECTRIC_SOURCE_SECRET: "source-secret",
			},
		);

		expect(upstream.searchParams.get("source_id")).toBe("source-id");
		expect(upstream.searchParams.get("secret")).toBe("source-secret");
	});
});
