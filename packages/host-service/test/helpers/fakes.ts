import type { ApiAuthProvider } from "../../src/providers/auth";
import type { HostAuthProvider } from "../../src/providers/host-auth";
import type { ModelProviderRuntimeResolver } from "../../src/providers/model-providers";
import type { GitCredentialProvider } from "../../src/runtime/git/types";
import type { ApiClient } from "../../src/types";

export class FakeApiAuthProvider implements ApiAuthProvider {
	constructor(private readonly headers: Record<string, string> = {}) {}
	async getHeaders(): Promise<Record<string, string>> {
		return { ...this.headers };
	}
}

export class FakeHostAuthProvider implements HostAuthProvider {
	constructor(private readonly psk: string) {}
	validate(request: Request): boolean {
		const header = request.headers.get("authorization");
		const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
		return token === this.psk;
	}
	validateToken(token: string): boolean {
		return token === this.psk;
	}
}

export class MemoryGitCredentialProvider implements GitCredentialProvider {
	constructor(private readonly token: string | null = null) {}
	async getCredentials(): Promise<{ env: Record<string, string> }> {
		return { env: {} };
	}
	async getToken(): Promise<string | null> {
		return this.token;
	}
}

export class FakeModelResolver implements ModelProviderRuntimeResolver {
	async hasUsableRuntimeEnv(): Promise<boolean> {
		return true;
	}
	async prepareRuntimeEnv(): Promise<void> {}
}

/**
 * Build a stand-in for the cloud `ApiClient` (a `TRPCClient<AppRouter>`).
 *
 * Tests register procedure implementations by dotted path (e.g.
 * `"organization.getByIdFromJwt.query"`). Anything unregistered throws so
 * an unmocked codepath fails loudly instead of silently returning undefined.
 */
export type FakeApiOverrides = Record<
	string,
	(input: unknown) => unknown | Promise<unknown>
>;

export function createFakeApiClient(overrides: FakeApiOverrides = {}): {
	client: ApiClient;
	calls: Array<{ path: string; input: unknown }>;
	set: (
		path: string,
		impl: (input: unknown) => unknown | Promise<unknown>,
	) => void;
} {
	const calls: Array<{ path: string; input: unknown }> = [];
	const handlers = new Map<
		string,
		(input: unknown) => unknown | Promise<unknown>
	>(Object.entries(overrides));

	const set = (
		path: string,
		impl: (input: unknown) => unknown | Promise<unknown>,
	): void => {
		handlers.set(path, impl);
	};

	const proxy = new Proxy(
		{},
		{
			get(_target, prop: string): unknown {
				return makePathProxy([prop]);
			},
		},
	);

	function makePathProxy(path: string[]): unknown {
		const handler: ProxyHandler<object> = {
			get(_target, prop: string): unknown {
				if (prop === "query" || prop === "mutate") {
					return async (input: unknown) => {
						const key = `${path.join(".")}.${prop}`;
						calls.push({ path: key, input });
						const impl = handlers.get(key);
						if (!impl) {
							throw new Error(
								`[fake-api] unmocked procedure: ${key}. Register via createFakeApiClient({ "${key}": (input) => ... }) or .set(...)`,
							);
						}
						return impl(input);
					};
				}
				return makePathProxy([...path, prop]);
			},
		};
		return new Proxy(() => undefined, handler);
	}

	return { client: proxy as ApiClient, calls, set };
}
