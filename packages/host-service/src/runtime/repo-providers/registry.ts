import type { GitProvider, RepoProviderClient } from "./types";

/** Builds a client bound to a specific instance host (e.g. gitlab.com, gl.acme.dev). */
export type RepoProviderClientFactory = (host: string) => RepoProviderClient;

const factories = new Map<GitProvider, RepoProviderClientFactory>();

/** Register the factory for a provider. Called once per provider at startup. */
export function registerProviderClient(
	provider: GitProvider,
	factory: RepoProviderClientFactory,
): void {
	factories.set(provider, factory);
}

/** Build the client for `provider` bound to `host`. Throws if unregistered. */
export function getProviderClient(
	provider: GitProvider,
	host: string,
): RepoProviderClient {
	const factory = factories.get(provider);
	if (!factory) {
		throw new Error(`No repo provider client registered for "${provider}"`);
	}
	return factory(host);
}

/** Test seam: drop all registrations. */
export function clearProviderClients(): void {
	factories.clear();
}
