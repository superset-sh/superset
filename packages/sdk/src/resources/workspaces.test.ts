import { expect, test } from "bun:test";
import { Superset } from "../client";
import { SupersetError } from "../core/error";

function envelope(json: unknown) {
	return Response.json({ result: { data: { json } } });
}

function clientWith(fetch: (url: URL, init?: RequestInit) => Response) {
	return new Superset({
		apiKey: "sk_test_fake",
		organizationId: "org",
		baseURL: "https://api.invalid",
		maxRetries: 0,
		fetch: async (url, init) => fetch(new URL(String(url)), init),
	});
}

test("create refuses a prompt without an agent before calling the API", async () => {
	const client = clientWith(() => {
		throw new Error("no request expected");
	});
	await expect(client.workspaces.create({ prompt: "hi" })).rejects.toThrow(
		"`prompt` requires `agent`",
	);
});

test("create names the startable environments when the requested one has no repositories", async () => {
	const client = clientWith((url) => {
		expect(url.pathname).toBe("/api/trpc/environment.list");
		return envelope([
			{ id: "e1", name: "empty", repositories: [] },
			{ id: "e2", name: "web", repositories: [{}] },
		]);
	});
	const created = client.workspaces.create({ environment: "EMPTY" });
	await expect(created).rejects.toBeInstanceOf(SupersetError);
	await expect(created).rejects.toThrow(
		'Environment "empty" has no repositories. Start from one with repositories: web',
	);
});

test("workspace calls reach a running sandbox without waking it, with one cached ticket and no API key", async () => {
	const requests: Array<{ url: URL; headers: Headers }> = [];
	const client = clientWith((url, init) => {
		requests.push({ url, headers: new Headers(init?.headers) });
		if (url.pathname === "/api/trpc/cloudWorkspace.hostTicket") {
			expect(JSON.parse(String(init?.body))).toEqual({
				json: { id: "ws" },
			});
			return envelope({
				url: "https://gate.invalid",
				token: "ticket",
				expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
			});
		}
		return envelope({ terminalId: "t1", status: "ok" });
	});

	await client.terminals.create({ workspaceId: "ws", command: "ls" });
	await client.terminals.close({ workspaceId: "ws", terminalId: "t1" });

	expect(requests.map(({ url }) => `${url.origin}${url.pathname}`)).toEqual([
		"https://api.invalid/api/trpc/cloudWorkspace.hostTicket",
		"https://gate.invalid/trpc/terminal.createSession",
		"https://gate.invalid/trpc/terminal.killSession",
	]);
	for (const { headers } of requests.slice(1)) {
		expect(headers.get("authorization")).toBe("Bearer ticket");
		expect(headers.get("x-api-key")).toBeNull();
	}
});
