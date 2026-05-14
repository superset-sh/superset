import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { clearShellEnvCache, getProcessEnvWithShellPath } from "./shell-env";

// Reproduces the macOS Electron scenario from issue #4418, where creating a
// workspace or cloning a repo fails with `spawn git ENOENT`. On macOS, GUI
// apps inherit a minimal launchd PATH that excludes Homebrew/usr-local. The
// derived shell PATH may also lack those locations depending on the user's
// shell config. The product code must guarantee macOS standard binary
// directories are present on darwin so git (typically at /opt/homebrew/bin/git
// or /usr/local/bin/git) can be spawned successfully.
describe("getProcessEnvWithShellPath always augments macOS PATH on darwin", () => {
	const originalPlatform = process.platform;

	beforeEach(() => {
		Object.defineProperty(process, "platform", { value: "darwin" });
		clearShellEnvCache();
	});

	afterEach(() => {
		Object.defineProperty(process, "platform", { value: originalPlatform });
		clearShellEnvCache();
	});

	test("includes /opt/homebrew/bin and /usr/local/bin even when base PATH lacks them", async () => {
		const env = await getProcessEnvWithShellPath({
			PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
		});

		expect(env.PATH).toContain("/opt/homebrew/bin");
		expect(env.PATH).toContain("/usr/local/bin");
	});
});
