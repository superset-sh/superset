import { expect, test } from "bun:test";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { signInOptionalProvider } from "./signInOptionalProvider";

for (const provider of ["authentik"] as const) {
	test(`${provider} turns a real resolved Better Auth error into the screen's error path`, async () => {
		const client = createAuthClient({
			baseURL: "https://api.example.invalid",
			plugins: [genericOAuthClient()],
			fetchOptions: {
				customFetchImpl: async () =>
					Response.json(
						{
							code: "PROVIDER_CONFIG_NOT_FOUND",
							message: "Provider configuration not found",
						},
						{ status: 400 },
					),
			},
		});
		await expect(
			signInOptionalProvider(provider, client.signIn),
		).rejects.toThrow("Provider configuration not found");
	});
	test(`${provider} preserves a successful authorization request and callback`, async () => {
		let request: Request | undefined;
		const client = createAuthClient({
			baseURL: "https://api.example.invalid",
			plugins: [genericOAuthClient()],
			fetchOptions: {
				customFetchImpl: async (input, init) => {
					request = new Request(input, init);
					return Response.json({
						url: "https://provider.example.invalid/authorize",
						redirect: false,
					});
				},
			},
		});
		await expect(
			signInOptionalProvider(provider, client.signIn),
		).resolves.toBeUndefined();
		if (!request) throw new Error("Authorization request was not made");
		expect(new URL(request.url).pathname).toBe("/api/auth/sign-in/oauth2");
		expect(await request.json()).toEqual({
			providerId: "authentik",
			callbackURL: "/",
		});
	});
	test(`${provider} propagates transport exceptions to the existing screen catch`, async () => {
		const failure = new Error("Transport failed");
		const client = createAuthClient({
			baseURL: "https://api.example.invalid",
			plugins: [genericOAuthClient()],
			fetchOptions: {
				customFetchImpl: async () => {
					throw failure;
				},
			},
		});
		await expect(signInOptionalProvider(provider, client.signIn)).rejects.toBe(
			failure,
		);
	});
}
