import { describe, expect, test } from "bun:test";
import { type CredentialDeps, sourceCredentials } from "./credentials";

const source = {
	organizationId: "org",
	repo: "acme/plugins",
	addedByUserId: "alice",
};

function deps(overrides: Partial<CredentialDeps>): CredentialDeps {
	return {
		memberRole: async () => "admin",
		userToken: async () => "alice-token",
		installationId: async () => "42",
		appToken: async (id, repo) => `app-${id}-${repo}`,
		...overrides,
	};
}

async function tokens(d: CredentialDeps) {
	const credentials = await sourceCredentials(source, d);
	return Promise.all(
		credentials.map(async (c) => `${c.as}:${await c.token()}`),
	);
}

describe("sourceCredentials", () => {
	test("the adding admin's GitHub account first, then the organization's App", async () => {
		expect(await tokens(deps({}))).toEqual([
			"admin:alice-token",
			"app:app-42-acme/plugins",
		]);
	});

	test("only the App once the admin has left or lost the admin role", async () => {
		expect(await tokens(deps({ memberRole: async () => null }))).toEqual([
			"app:app-42-acme/plugins",
		]);
		expect(await tokens(deps({ memberRole: async () => "member" }))).toEqual([
			"app:app-42-acme/plugins",
		]);
	});

	test("only the App when the admin has not connected GitHub", async () => {
		expect(await tokens(deps({ userToken: async () => null }))).toEqual([
			"app:app-42-acme/plugins",
		]);
	});

	test("only the admin's account when the App is not installed", async () => {
		expect(await tokens(deps({ installationId: async () => null }))).toEqual([
			"admin:alice-token",
		]);
	});
});
