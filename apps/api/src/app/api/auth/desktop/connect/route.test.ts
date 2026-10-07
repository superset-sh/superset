import { expect, mock, test } from "bun:test";

const calls: Array<{ method: string; body: Record<string, string> }> = [];
function response(method: string, input: { body: Record<string, string> }) {
	calls.push({ method, body: input.body });
	return Response.json(
		{ url: "https://provider.example.com/authorize" },
		{ headers: { "set-cookie": "oauth-state=opaque; HttpOnly" } },
	);
}
mock.module("@superset/auth/server", () => ({
	auth: {
		api: {
			signInSocial: (input: { body: Record<string, string> }) =>
				response("social", input),
		},
	},
}));
mock.module("@/env", () => ({
	env: { NEXT_PUBLIC_WEB_URL: "https://web.example.com" },
}));
const { GET } = await import("./route");
for (const provider of ["github", "google", "gitlab"]) {
	test(`${provider} keeps desktop state and cookie forwarding`, async () => {
		calls.length = 0;
		const result = await GET(
			new Request(
				`https://api.example.com/api/auth/desktop/connect?provider=${provider}&state=opaque&protocol=superset&local_callback=http://127.0.0.1:51741/auth/callback`,
			),
		);
		expect(result.status).toBe(307);
		expect(result.headers.get("location")).toBe(
			"https://provider.example.com/authorize",
		);
		expect(result.headers.getSetCookie()).toEqual([
			"oauth-state=opaque; HttpOnly",
		]);
		expect(calls).toHaveLength(1);
		const call = calls[0];
		if (!call) throw new Error("Sign-in was not called");
		expect(call.method).toBe("social");
		expect(call.body.provider).toBe(provider);
		const callback = new URL(call.body.callbackURL ?? "");
		expect(callback.origin).toBe("https://web.example.com");
		expect(callback.searchParams.get("desktop_state")).toBe("opaque");
		expect(callback.searchParams.get("desktop_protocol")).toBe("superset");
		expect(callback.searchParams.get("desktop_local_callback")).toBe(
			"http://127.0.0.1:51741/auth/callback",
		);
	});
}
test("an unknown provider is rejected before starting auth", async () => {
	calls.length = 0;
	expect(
		(
			await GET(
				new Request(
					"https://api.example.com/api/auth/desktop/connect?provider=unknown&state=opaque",
				),
			)
		).status,
	).toBe(400);
	expect(calls).toHaveLength(0);
});
test("an external local callback is not forwarded", async () => {
	calls.length = 0;
	await GET(
		new Request(
			"https://api.example.com/api/auth/desktop/connect?provider=gitlab&state=opaque&local_callback=https://evil.example.com/auth/callback",
		),
	);
	expect(
		new URL(calls[0]?.body.callbackURL ?? "").searchParams.has(
			"desktop_local_callback",
		),
	).toBe(false);
});
