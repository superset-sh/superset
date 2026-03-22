import { describe, expect, test } from "bun:test";
import { augmentPathForMacOS } from "./shell-env";

/**
 * Reproduction test for #2671:
 * On macOS, Electron GUI apps get a minimal PATH. When shell-env times out,
 * the fallback must include /usr/bin (where macOS system git lives) so that
 * `spawn git` doesn't fail with ENOENT.
 */
describe("macOS GUI app git PATH resolution (#2671)", () => {
	test("augmentPathForMacOS includes /usr/bin when PATH is empty", () => {
		// Simulates an Electron GUI app with no inherited PATH
		const env: Record<string, string> = { PATH: "" };
		augmentPathForMacOS(env, "darwin");

		expect(env.PATH).toContain("/usr/bin");
		expect(env.PATH).toContain("/bin");
	});

	test("augmentPathForMacOS includes /usr/bin when PATH has only homebrew", () => {
		// Simulates a partial PATH that only has homebrew but no system dirs
		const env: Record<string, string> = {
			PATH: "/opt/homebrew/bin:/opt/homebrew/sbin",
		};
		augmentPathForMacOS(env, "darwin");

		expect(env.PATH).toContain("/usr/bin");
		expect(env.PATH).toContain("/bin");
		expect(env.PATH).toContain("/usr/sbin");
		expect(env.PATH).toContain("/sbin");
	});

	test("augmentPathForMacOS includes all standard macOS /etc/paths entries", () => {
		// macOS /etc/paths contains: /usr/local/bin, /usr/bin, /bin, /usr/sbin, /sbin
		const env: Record<string, string> = {};
		augmentPathForMacOS(env, "darwin");

		const entries = env.PATH.split(":");
		expect(entries).toContain("/usr/local/bin");
		expect(entries).toContain("/usr/bin");
		expect(entries).toContain("/bin");
		expect(entries).toContain("/usr/sbin");
		expect(entries).toContain("/sbin");
	});

	test("getProcessEnvWithShellPath includes system paths even with shell env", async () => {
		// Import fresh to avoid cache interference
		const { clearShellEnvCache, getProcessEnvWithShellPath } = await import(
			"./shell-env"
		);
		clearShellEnvCache();

		try {
			const env = await getProcessEnvWithShellPath({
				PATH: "/some/custom/path",
			} as unknown as NodeJS.ProcessEnv);

			// Regardless of shell env result, on macOS the PATH should include
			// /usr/bin so git can be found (on other platforms this is a no-op)
			if (process.platform === "darwin") {
				expect(env.PATH).toContain("/usr/bin");
				expect(env.PATH).toContain("/bin");
			}
			// On all platforms, PATH should at minimum be defined
			expect(env.PATH).toBeDefined();
		} finally {
			clearShellEnvCache();
		}
	});
});
