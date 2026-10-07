import { expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const childCase = process.env.SUPERSET_UPDATE_FEED_FIXTURE;
if (!childCase) {
	for (const [name, version, feed, expected] of [
		[
			"stable default",
			"1.35.0",
			"",
			"https://github.com/superset-sh/superset/releases/latest/download",
		],
		[
			"canary default",
			"1.35.0-canary",
			"",
			"https://github.com/superset-sh/superset/releases/download/desktop-canary",
		],
		[
			"stable override",
			"1.35.0",
			"https://downloads.fixture.invalid/desktop",
			"https://downloads.fixture.invalid/desktop",
		],
		[
			"canary override",
			"1.35.0-canary",
			"https://downloads.fixture.invalid/canary",
			"https://downloads.fixture.invalid/canary",
		],
		["invalid override", "1.35.0", "invalid-feed", "invalid"],
		[
			"build override",
			"1.35.0",
			"https://downloads.fixture.invalid/desktop",
			"https://downloads.fixture.invalid/desktop",
		],
	]) {
		test(`actual desktop updater ${name}`, () => {
			const cwd = mkdtempSync(join(tmpdir(), "superset-update-feed-"));
			try {
				const result = Bun.spawnSync(
					[process.execPath, "--no-env-file", "test", import.meta.path],
					{
						cwd,
						env: {
							PATH: process.env.PATH,
							TMPDIR: tmpdir(),
							NODE_ENV: "production",
							SUPERSET_UPDATE_FEED_FIXTURE: name,
							FIXTURE_VERSION: version,
							UPDATE_FEED_URL: feed,
							FIXTURE_EXPECTED_FEED: expected,
						},
						stdout: "pipe",
						stderr: "pipe",
						timeout: 20_000,
					},
				);
				process.stdout.write(result.stdout);
				process.stderr.write(result.stderr);
				expect(result.exitCode).toBe(0);
			} finally {
				rmSync(cwd, { recursive: true, force: true });
			}
		}, 25_000);
	}
} else {
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Real network forbidden in updater fixture");
		},
		{ preconnect() {} },
	);
	mock.module("@sentry/electron/main", () => ({
		captureException() {
			throw new Error("Unexpected updater telemetry");
		},
	}));
	mock.module("@lingui/core/macro", () => ({
		msg: (value: { message: string }) => value.message,
	}));
	mock.module("electron", () => ({
		app: {
			getVersion: () => process.env.FIXTURE_VERSION,
			isReady: () => false,
			whenReady: () => new Promise(() => {}),
		},
		dialog: {
			showMessageBox() {
				throw new Error("Unexpected native dialog");
			},
		},
	}));
	mock.module("electron-log/main", () => ({
		default: {
			transports: { file: { level: "" } },
			info() {},
			warn() {},
			error() {},
		},
	}));
	mock.module("main/index", () => ({ setSkipQuitConfirmation() {} }));
	mock.module("main/lib/app-state", () => ({
		appState: {
			data: { lastRunVersion: process.env.FIXTURE_VERSION },
			write: async () => {},
		},
	}));
	let captured: unknown;
	const updater = {
		autoDownload: false,
		autoInstallOnAppQuit: false,
		disableDifferentialDownload: false,
		allowDowngrade: false,
		setFeedURL: (value: unknown) => {
			captured = value;
		},
		on() {},
		checkForUpdates() {
			throw new Error("Unexpected update request");
		},
	};
	mock.module("electron-updater", () => ({ autoUpdater: updater }));
	test(`controlled genuine updater ${childCase}`, async () => {
		if (childCase === "build override") {
			mock.module("dotenv", () => ({ config: () => ({ parsed: {} }) }));
			mock.module("@sentry/vite-plugin", () => ({
				sentryVitePlugin: () => ({}),
			}));
			mock.module("@tailwindcss/vite", () => ({ default: () => [] }));
			mock.module("@tanstack/router-plugin/vite", () => ({
				tanstackRouter: () => ({}),
			}));
			mock.module("@vitejs/plugin-react", () => ({ default: () => ({}) }));
			mock.module("electron-vite", () => ({
				defineConfig: (value: unknown) => value,
				externalizeDepsPlugin: () => ({}),
			}));
			mock.module("rollup-plugin-inject-process-env", () => ({
				default: () => ({}),
			}));
			mock.module("vite-tsconfig-paths", () => ({ default: () => ({}) }));
			const { default: config } = await import("../../../electron.vite.config");
			const mainConfig = await config.main;
			const rendererConfig = await config.renderer;
			if (
				!mainConfig ||
				typeof mainConfig === "function" ||
				!rendererConfig ||
				typeof rendererConfig === "function"
			)
				throw new Error(
					"The controlled build config requires main and renderer objects",
				);
			expect(mainConfig.define?.["process.env.UPDATE_FEED_URL"]).toBe(
				JSON.stringify(process.env.UPDATE_FEED_URL),
			);
			expect(rendererConfig.define).not.toHaveProperty(
				"process.env.UPDATE_FEED_URL",
			);
			return;
		}
		if (process.env.FIXTURE_EXPECTED_FEED === "invalid") {
			await expect(import("./auto-updater")).rejects.toThrow();
			expect(captured).toBeUndefined();
			return;
		}
		const { env } = await import("../env.main");
		expect(env.NEXT_PUBLIC_API_URL).toBe("https://api.superset.sh");
		const timers: ReturnType<typeof setInterval>[] = [];
		const originalInterval = globalThis.setInterval;
		globalThis.setInterval = Object.assign(
			(...args: Parameters<typeof originalInterval>) => {
				const timer = originalInterval(...args);
				timers.push(timer);
				return timer;
			},
			originalInterval,
		);
		try {
			const { setupAutoUpdater } = await import("./auto-updater");
			setupAutoUpdater();
			expect(captured).toEqual({
				provider: "generic",
				url: process.env.FIXTURE_EXPECTED_FEED,
			});
			const fixtureVersion = process.env.FIXTURE_VERSION;
			if (fixtureVersion === undefined)
				throw new Error("The controlled updater version is missing");
			expect(updater.allowDowngrade).toBe(fixtureVersion.includes("canary"));
			expect(updater.autoDownload).toBe(true);
		} finally {
			globalThis.setInterval = originalInterval;
			for (const timer of timers) clearInterval(timer);
		}
	});
}
