import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	test as base,
	type ElectronApplication,
	_electron as electron,
	expect,
	type Page,
} from "@playwright/test";
import electronPath from "electron";

interface DesktopFixtures {
	appWindow: Page;
	electronApp: ElectronApplication;
	supersetHomeDir: string;
}

const appEntry = join(process.cwd(), "dist", "main", "index.js");
const alwaysCapture =
	process.env.DESKTOP_E2E_ALWAYS_CAPTURE === "1" ||
	process.env.DESKTOP_E2E_ALWAYS_CAPTURE === "true";
const authSeedEnv = {
	...(process.env.DESKTOP_E2E_AUTH_TOKEN
		? {
				DESKTOP_TEST_AUTH_TOKEN: process.env.DESKTOP_E2E_AUTH_TOKEN,
			}
		: {}),
	...(process.env.DESKTOP_E2E_AUTH_EXPIRES_AT
		? {
				DESKTOP_TEST_AUTH_EXPIRES_AT: process.env.DESKTOP_E2E_AUTH_EXPIRES_AT,
			}
		: {}),
};

async function waitForMainWindow(
	electronApp: ElectronApplication,
): Promise<Page> {
	await expect
		.poll(
			() =>
				electronApp
					.windows()
					.map((window) => window.url())
					.join("\n"),
			{ timeout: 90_000 },
		)
		.toContain("index.html");

	const mainWindow = electronApp
		.windows()
		.find((window) => window.url().includes("index.html"));

	if (!mainWindow) {
		throw new Error("Desktop E2E could not find the main renderer window.");
	}

	return mainWindow;
}

export const test = base.extend<DesktopFixtures>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixture callbacks require object destructuring for the first parameter.
	supersetHomeDir: async ({}, use) => {
		const homeDir = mkdtempSync(join(tmpdir(), "superset-desktop-e2e-"));
		await use(homeDir);
	},

	electronApp: async ({ supersetHomeDir }, use, testInfo) => {
		const electronApp = await electron.launch({
			executablePath: electronPath,
			args: [appEntry],
			env: {
				...process.env,
				NODE_ENV: "test",
				DESKTOP_TEST_MODE: "1",
				SUPERSET_HOME_DIR: supersetHomeDir,
				DESKTOP_E2E_ARTIFACTS_DIR: testInfo.outputPath("artifacts"),
				...authSeedEnv,
			},
			recordVideo: alwaysCapture
				? {
						dir: testInfo.outputPath("videos"),
						size: {
							width: 1440,
							height: 960,
						},
					}
				: undefined,
		});

		await use(electronApp);
		await electronApp.close();
	},

	appWindow: async ({ electronApp }, use) => {
		const appWindow = await waitForMainWindow(electronApp);
		appWindow.on("console", (message) => {
			console.log(`[desktop console][${message.type()}] ${message.text()}`);
		});
		appWindow.on("pageerror", (error) => {
			console.error(`[desktop pageerror] ${error.message}`);
		});
		await appWindow.waitForLoadState("domcontentloaded");
		await use(appWindow);
	},
});

export { expect };
