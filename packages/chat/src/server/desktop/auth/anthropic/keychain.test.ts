import { beforeEach, describe, expect, it, mock } from "bun:test";

const execSyncMock = mock((_command: string, _options?: unknown) => "");
const platformMock = mock(() => "darwin" as NodeJS.Platform);
const realOs = await import("node:os");

mock.module("node:child_process", () => ({
	execSync: execSyncMock,
}));

mock.module("node:os", () => ({
	...realOs,
	platform: platformMock,
	homedir: realOs.homedir,
}));

const { clearAnthropicKeychainCache, probeAnthropicKeychain } = await import(
	"./keychain"
);

function rejectAll() {
	execSyncMock.mockImplementation(() => {
		// Simulate the common case: keychain has no anthropic entry. The
		// security CLI exits non-zero, which execSync surfaces as a throw.
		throw new Error(
			"security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.",
		);
	});
}

describe("probeAnthropicKeychain — repeated invocations (#4622)", () => {
	beforeEach(() => {
		execSyncMock.mockClear();
		rejectAll();
		platformMock.mockReturnValue("darwin");
		clearAnthropicKeychainCache();
	});

	it("does not re-shell `security find-generic-password` on every poll", () => {
		// Issue #4622: getAnthropicAuthStatus is called from multiple
		// renderer queries (ModelPicker, ModelsSettings, setup flow). Each
		// invocation today runs two `security find-generic-password` calls.
		// When 1Password's Keychain integration is active, every such call
		// triggers a vault-authorization prompt — bursts of 3-6 prompts in
		// the same window, then again ~10s later as the renderer re-polls.
		//
		// Resolving keychain absence is a stable answer for the lifetime of
		// the cache TTL, so repeated polls within that window should be
		// served from the cache instead of re-shelling.
		for (let i = 0; i < 5; i++) {
			probeAnthropicKeychain();
		}

		// Without caching this is 10 (2 commands × 5 calls). With caching,
		// once the absence is observed it should be remembered so the
		// renderer's polling doesn't fan out to 1Password.
		expect(execSyncMock).toHaveBeenCalledTimes(2);
	});

	it("caches a found credential so the second probe is skipped", () => {
		execSyncMock.mockImplementationOnce(() => "sk-cached-key\n");

		const first = probeAnthropicKeychain();
		const second = probeAnthropicKeychain();

		expect(first).toEqual({
			apiKey: "sk-cached-key",
			service: "claude-cli",
		});
		expect(second).toEqual(first);
		expect(execSyncMock).toHaveBeenCalledTimes(1);
	});

	it("re-runs the keychain probe after the cache is explicitly cleared", () => {
		probeAnthropicKeychain();
		const callsAfterFirst = execSyncMock.mock.calls.length;

		clearAnthropicKeychainCache();
		probeAnthropicKeychain();

		expect(execSyncMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
	});

	it("returns null without shelling out on non-darwin platforms", () => {
		platformMock.mockReturnValue("linux");
		clearAnthropicKeychainCache();

		const result = probeAnthropicKeychain();

		expect(result).toBeNull();
		expect(execSyncMock).not.toHaveBeenCalled();
	});
});
