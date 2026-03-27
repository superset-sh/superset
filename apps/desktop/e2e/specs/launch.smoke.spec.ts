import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "../fixtures/desktop";

const expectedAuthExpiresAt = process.env.DESKTOP_E2E_AUTH_EXPIRES_AT
	? new Date(process.env.DESKTOP_E2E_AUTH_EXPIRES_AT).toISOString()
	: null;
const shouldExpectAuthenticated =
	process.env.DESKTOP_E2E_EXPECT_AUTHENTICATED === "1";
const expectedTokenPresent = Boolean(process.env.DESKTOP_E2E_AUTH_TOKEN);
const metadataPath = process.env.DESKTOP_E2E_METADATA_PATH ?? null;

test("launches in desktop test mode", async ({
	appWindow,
	electronApp,
	supersetHomeDir,
}) => {
	await expect
		.poll(() => appWindow.evaluate(() => window.App.testMode))
		.toBe(true);

	await expect
		.poll(() => appWindow.evaluate(() => window.App.appVersion))
		.not.toBe("");

	await expect
		.poll(() => appWindow.evaluate(() => window.App.automation.ping()))
		.toMatchObject({
			ok: true,
			testMode: true,
		});

	await expect
		.poll(() =>
			appWindow.evaluate(() => window.App.automation.getEnvironment()),
		)
		.toMatchObject({
			testMode: true,
			supersetHomeDir,
		});

	await expect
		.poll(() => appWindow.evaluate(() => window.App.automation.getWindowInfo()))
		.toMatchObject({
			isVisible: true,
			bounds: {
				width: 1440,
				height: 960,
			},
		});

	await expect
		.poll(() => appWindow.evaluate(() => window.App.automation.getAuthState()))
		.toMatchObject({
			tokenPresent: expectedTokenPresent,
			expiresAt: expectedAuthExpiresAt,
		});

	await expect
		.poll(async () => {
			return electronApp.evaluate(({ app }) => app.isReady());
		})
		.toBe(true);

	await expect
		.poll(() => appWindow.evaluate(() => document.readyState))
		.toBe("complete");
	await expect
		.poll(() => appWindow.evaluate(() => document.body?.innerHTML.length ?? 0))
		.toBeGreaterThan(0);
	await expect
		.poll(() => appWindow.evaluate(() => window.location.href))
		.toContain("index.html");
	if (shouldExpectAuthenticated) {
		await expect
			.poll(() => appWindow.evaluate(() => window.location.hash))
			.toMatch(/^#\/(_authenticated|create-organization)(\/.*)?$/);
		await expect
			.poll(() => appWindow.evaluate(() => document.body?.innerText ?? ""))
			.not.toContain("Welcome to Superset");
		await expect
			.poll(() => appWindow.evaluate(() => document.body?.innerText ?? ""))
			.not.toContain("Restoring your session");
		await expect
			.poll(() => appWindow.evaluate(() => document.body?.innerText ?? ""))
			.not.toContain("Sign in to get started");
	}

	if (metadataPath) {
		const metadata = await appWindow.evaluate(async () => ({
			authState: await window.App.automation.getAuthState(),
			hash: window.location.hash,
			pathname: window.location.pathname,
			textSample: (document.body?.innerText ?? "").slice(0, 500),
		}));
		mkdirSync(dirname(metadataPath), { recursive: true });
		writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
	}

	await expect(supersetHomeDir).toContain("superset-desktop-e2e-");
});
