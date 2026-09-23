import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { getHostId } from "@superset/shared/host-info";
import { trackCommandInvoked } from "./analytics";

let sent: Array<Record<string, any>>;
const realFetch = globalThis.fetch;

beforeEach(() => {
	sent = [];
	process.env.SUPERSET_POSTHOG_KEY = "phc_test";
	globalThis.fetch = (async (_url: string, init: RequestInit) => {
		sent.push(JSON.parse(String(init.body)));
		return new Response(null);
	}) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
	delete process.env.SUPERSET_POSTHOG_KEY;
});

const oauthToken = `h.${Buffer.from(JSON.stringify({ sub: "user-1", organizationId: "org-token" })).toString("base64url")}.s`;

function track(overrides: Partial<Parameters<typeof trackCommandInvoked>[0]>) {
	trackCommandInvoked({
		bearer: oauthToken,
		authSource: "oauth",
		organizationId: "org-config",
		commandPath: ["tasks", "list"],
		flags: [],
		...overrides,
	});
}

describe("trackCommandInvoked", () => {
	test("reports an OAuth session as its user", () => {
		track({});
		expect(sent).toHaveLength(1);
		expect(sent[0]?.distinct_id).toBe("user-1");
		expect(sent[0]?.properties).toMatchObject({
			source: "cli",
			command: "tasks list",
			sample_rate: 1,
			$groups: { organization: "org-config" },
		});
	});

	test("reports an API key anonymously under its organization", () => {
		track({ bearer: "sk_live_abc", authSource: "config" });
		expect(sent[0]?.distinct_id).toBe(getHostId());
		expect(sent[0]?.properties).toMatchObject({
			$groups: { organization: "org-config" },
		});
	});

	test("reports one in a hundred polling runs", () => {
		const random = spyOn(Math, "random");
		random.mockReturnValue(0.5);
		track({ commandPath: ["terminals", "read"] });
		expect(sent).toHaveLength(0);

		random.mockReturnValue(0.001);
		track({ commandPath: ["terminals", "read"] });
		expect(sent[0]?.properties.sample_rate).toBe(100);
		random.mockRestore();
	});
});
