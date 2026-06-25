import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Credential =
	| { type: "api_key"; key: string }
	| { type: "oauth"; access: string; expires: number; refresh?: string };

function createFakeAuthStorage() {
	const credentials = new Map<string, Credential>();
	const apiKeys = new Map<string, string>();
	return {
		reload: mock(() => {}),
		get: mock((providerId: string) => credentials.get(providerId)),
		set: mock((providerId: string, credential: Credential) => {
			credentials.set(providerId, credential);
		}),
		remove: mock((providerId: string) => {
			credentials.delete(providerId);
		}),
		setStoredApiKey: mock((providerId: string, key: string) => {
			apiKeys.set(providerId, key);
		}),
		getStoredApiKey: mock((providerId: string) => apiKeys.get(providerId)),
		getApiKey: mock(async (providerId: string) => {
			const cred = credentials.get(providerId);
			if (cred?.type === "oauth") return cred.access;
			return apiKeys.get(providerId);
		}),
		clear: () => {
			credentials.clear();
			apiKeys.clear();
		},
	};
}

const fakeAuthStorage = createFakeAuthStorage();
mock.module("mastracode", () => ({
	createAuthStorage: () => fakeAuthStorage,
}));

// Simulate the user's external Claude CLI being logged in:
// `~/.claude/.credentials.json` exists with a valid OAuth access token. The
// LocalModelProvider's `resolveAnthropicCredential` discovers it and reports
// `hasUsableCredential: true`. We mock at the utils boundary because
// `node:os` `homedir()` ignores runtime HOME overrides under Bun, so we can't
// redirect the credential lookup with a temp HOME.
mock.module("./utils", () => ({
	hasUsableCredential: (credential: { kind: string } | null) =>
		credential !== null,
	resolveAnthropicCredential: async () => ({
		kind: "oauth" as const,
		expiresAt: Date.now() + 60 * 60 * 1000,
	}),
	resolveOpenAICredential: () => null,
}));

const { LocalModelProvider } = await import("./LocalModelProvider");

const CREDENTIAL_ENV_KEYS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"OPENAI_API_KEY",
	"OPENAI_AUTH_TOKEN",
] as const;

const originalEnv: Record<string, string | undefined> = {};
let tempHome: string | null = null;
let originalSupersetHome: string | undefined;

beforeEach(() => {
	fakeAuthStorage.clear();
	tempHome = mkdtempSync(join(tmpdir(), "local-model-provider-test-"));
	originalSupersetHome = process.env.SUPERSET_HOME_DIR;
	// Point the managed Anthropic env config away from any real config file
	// so the managed-config path is empty in this test.
	process.env.SUPERSET_HOME_DIR = tempHome;
	for (const key of CREDENTIAL_ENV_KEYS) {
		originalEnv[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	if (tempHome) rmSync(tempHome, { recursive: true, force: true });
	tempHome = null;
	if (originalSupersetHome === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHome;
	}
	for (const key of CREDENTIAL_ENV_KEYS) {
		const value = originalEnv[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("LocalModelProvider — #4921 self-hosted Linux", () => {
	it("propagates ~/.claude/.credentials.json OAuth token to the runtime so mastracode can authenticate", async () => {
		// Reproduces issue #4921: on a self-hosted Linux machine, the Claude
		// CLI is logged in (`~/.claude/.credentials.json` exists with a valid
		// OAuth access token), but every chat message returns "Not logged in
		// to Anthropic. Run /login first." That error is thrown by mastracode's
		// `buildAnthropicOAuthFetch` when it can't find an Anthropic OAuth
		// credential in its own auth storage *and* there is no
		// ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN env var set on the process.
		//
		// The host-service's LocalModelProvider detects the external Claude
		// credential and (correctly) reports `hasUsableRuntimeEnv: true`, so
		// chat-runtime creation does not throw "No model provider credentials
		// available". But the credential is then discarded — the runtime env
		// LocalModelProvider applies to `process.env` only contains keys from
		// the managed `chat-anthropic-env.json` file (with credentials stripped),
		// and the external Claude OAuth token is never copied into mastracode's
		// auth storage either. The result: mastracode runs with no anthropic
		// credentials it can see, and the first API call fails.
		const provider = new LocalModelProvider();

		// External Claude credential is detected, so chat-runtime creation is
		// allowed to proceed (no "No model provider credentials available"
		// throw).
		expect(await provider.hasUsableRuntimeEnv()).toBe(true);

		// Now the runtime is "prepared" — this is what host-service does just
		// before handing control to mastracode.
		await provider.prepareRuntimeEnv();

		// The bug: the OAuth access token never makes it anywhere mastracode
		// can see. Neither an env var nor an entry in mastracode's auth storage
		// gets populated, so `buildAnthropicOAuthFetch` will throw
		// "Not logged in to Anthropic. Run /login first." on the first request.
		const mastracodeHasOAuth =
			fakeAuthStorage.get("anthropic")?.type === "oauth";
		const mastracodeHasApiKey =
			fakeAuthStorage.getStoredApiKey("anthropic") !== undefined ||
			fakeAuthStorage.get("anthropic")?.type === "api_key";
		const envHasCredential =
			Boolean(process.env.ANTHROPIC_AUTH_TOKEN?.trim()) ||
			Boolean(process.env.ANTHROPIC_API_KEY?.trim());

		expect(mastracodeHasOAuth || mastracodeHasApiKey || envHasCredential).toBe(
			true,
		);
	});
});
