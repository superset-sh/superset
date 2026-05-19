import { describe, expect, it, mock } from "bun:test";

const { JwtApiAuthProvider } = await import("./JwtAuthProvider");

function jwtWithExp(expiresAtMs: number): string {
	const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
		"base64url",
	);
	const payload = Buffer.from(
		JSON.stringify({ exp: Math.floor(expiresAtMs / 1000) }),
	).toString("base64url");
	return `${header}.${payload}.signature`;
}

describe("JwtAuthProvider getJwt", () => {
	it("delegates the JWT branch to getSessionToken once per invocation without caching", async () => {
		const accessToken = jwtWithExp(Date.now() + 60 * 60 * 1000);
		const getSessionToken = mock(async () => accessToken);
		const originalFetch = globalThis.fetch;
		const fetchMock = mock(async () => new Response(null, { status: 500 }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const provider = new JwtApiAuthProvider({
			getSessionToken,
			apiUrl: "https://api.example.com",
		});

		expect(await provider.getJwt()).toBe(accessToken);
		expect(await provider.getJwt()).toBe(accessToken);
		expect(getSessionToken).toHaveBeenCalledTimes(2);
		expect(fetchMock).not.toHaveBeenCalled();

		globalThis.fetch = originalFetch;
	});
});
