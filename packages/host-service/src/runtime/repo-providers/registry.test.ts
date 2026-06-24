import { beforeEach, describe, expect, it } from "bun:test";
import {
	clearProviderClients,
	getProviderClient,
	registerProviderClient,
} from "./registry";
import type { GitProvider, RepoProviderClient } from "./types";

function fakeClient(provider: GitProvider, host: string): RepoProviderClient {
	// Registry only reads provider+host; stub the capability methods for the test.
	return { provider, host } as unknown as RepoProviderClient;
}

describe("repo-providers registry", () => {
	beforeEach(() => clearProviderClients());

	it("returns a client built by the registered factory, bound to the host", () => {
		registerProviderClient("github", (host) => fakeClient("github", host));
		const client = getProviderClient("github", "github.com");
		expect(client.provider).toBe("github");
		expect(client.host).toBe("github.com");
	});

	it("builds a distinct client per host (self-managed support)", () => {
		registerProviderClient("gitlab", (host) => fakeClient("gitlab", host));
		expect(getProviderClient("gitlab", "gitlab.com").host).toBe("gitlab.com");
		expect(getProviderClient("gitlab", "gl.acme.dev").host).toBe("gl.acme.dev");
	});

	it("throws for an unregistered provider", () => {
		expect(() => getProviderClient("gitlab", "gitlab.com")).toThrow(
			/no repo provider client registered for "gitlab"/i,
		);
	});

	it("clearProviderClients removes registrations", () => {
		registerProviderClient("github", (host) => fakeClient("github", host));
		clearProviderClients();
		expect(() => getProviderClient("github", "github.com")).toThrow();
	});
});
