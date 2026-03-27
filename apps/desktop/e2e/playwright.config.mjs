import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const e2eDir = fileURLToPath(new URL(".", import.meta.url));
const artifactsDir =
	process.env.DESKTOP_E2E_ARTIFACTS_DIR ??
	join(process.cwd(), "test-results", "desktop-e2e");
const alwaysCapture =
	process.env.DESKTOP_E2E_ALWAYS_CAPTURE === "1" ||
	process.env.DESKTOP_E2E_ALWAYS_CAPTURE === "true";

export default defineConfig({
	testDir: join(e2eDir, "specs"),
	outputDir: join(artifactsDir, "output"),
	timeout: 90_000,
	fullyParallel: false,
	workers: 1,
	reporter: [["list"]],
	use: {
		screenshot: alwaysCapture ? "on" : "only-on-failure",
		trace: alwaysCapture ? "on" : "retain-on-failure",
		video: alwaysCapture ? "on" : "retain-on-failure",
	},
});
