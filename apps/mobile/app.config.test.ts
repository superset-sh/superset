import { afterAll, describe, expect, mock, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.TEST_MOBILE_IDENTITY !== "1") {
	test("actual Expo configuration with an isolated dotenv boundary", () => {
		const statuses: (number | null)[] = [];
		for (const initiallyOwned of [false, true]) {
			const cwd = mkdtempSync("/tmp/superset-mobile-identity-child-");
			try {
				const child = spawnSync(
					process.execPath,
					["--no-env-file", "test", fileURLToPath(import.meta.url)],
					{
						cwd,
						env: {
							PATH: "/usr/bin:/bin",
							TMPDIR: "/tmp",
							TEST_MOBILE_IDENTITY: "1",
							...(initiallyOwned && {
								TEST_MOBILE_INITIAL_OWNED: "1",
								APPLE_TEAM_ID: "AB123CD456",
								EXPO_PUBLIC_IOS_BUNDLE_ID: "com.example.owned",
							}),
						},
						timeout: 30000,
						stdio: "pipe",
					},
				);
				process.stdout.write(child.stdout);
				process.stderr.write(child.stderr);
				if (child.error) throw child.error;
				statuses.push(child.status);
			} finally {
				rmSync(cwd, { recursive: true, force: true });
			}
		}
		expect(statuses).toEqual([0, 0]);
	});
} else {
	const dotenvExports = { ...(await import("dotenv")) };
	const actualDotenvConfig = dotenvExports.config;
	const { SUPPORTED_LOCALES } = await import("@superset/i18n/locales");
	const constants = await import("@superset/shared/constants");
	const initialEnvironment = { ...process.env };
	delete initialEnvironment.APPLE_TEAM_ID;
	delete initialEnvironment.EXPO_PUBLIC_IOS_BUNDLE_ID;
	const fixtureDirectory = mkdtempSync("/tmp/superset-mobile-identity-env-");
	const fixtureEnv = path.join(fixtureDirectory, ".env");
	const dotenvCalls: Record<string, unknown>[] = [];
	const configSource = readFileSync(
		new URL("./app.config.ts", import.meta.url),
		"utf8",
	)
		.replace(
			'"@superset/shared/constants"',
			JSON.stringify(
				new URL("../../packages/shared/src/constants.ts", import.meta.url).href,
			),
		)
		.replace(
			'"@superset/i18n/locales"',
			JSON.stringify(
				new URL("../../packages/i18n/src/locales.ts", import.meta.url).href,
			),
		)
		.replace(
			'"./config-plugins/withIosAccentColor"',
			JSON.stringify(
				new URL("./config-plugins/withIosAccentColor.js", import.meta.url).href,
			),
		)
		.replace(
			'"./config-plugins/withSceneLifecycle"',
			JSON.stringify(
				new URL("./config-plugins/withSceneLifecycle.js", import.meta.url).href,
			),
		)
		.replace('"dotenv"', JSON.stringify(import.meta.resolve("dotenv")));
	// Bun caches directory entries, so later imports need their files present now.
	for (let index = 1; index <= 64; index++)
		writeFileSync(
			path.join(fixtureDirectory, `config-${index}.ts`),
			configSource,
		);
	let imports = 0;
	const deny = () => {
		throw Error("external execution denied");
	};
	globalThis.fetch = Object.assign(async () => deny(), {
		preconnect: deny,
	});
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(deny);
	spyOn(Bun, "spawn").mockImplementation(deny);
	spyOn(Bun, "spawnSync").mockImplementation(deny);
	const childProcess = await import("node:child_process");
	for (const name of [
		"spawn",
		"spawnSync",
		"exec",
		"execSync",
		"execFile",
		"execFileSync",
	] as const)
		spyOn(childProcess, name).mockImplementation(deny);
	mock.module("node:worker_threads", () => ({ Worker: deny }));
	mock.module("dotenv", () => ({
		...dotenvExports,
		config: (options: Record<string, unknown>) => {
			dotenvCalls.push(options);
			return actualDotenvConfig({
				path: fixtureEnv,
				override: options.override === true,
				quiet: true,
			});
		},
	}));
	const accentColor = deny;
	mock.module(
		fileURLToPath(
			new URL("./config-plugins/withIosAccentColor.js", import.meta.url),
		),
		() => ({ withIosAccentColor: accentColor }),
	);
	const widgetConfig = (
		await import("./targets/agentactivity/expo-target.config.js")
	).default;
	afterAll(() => {
		rmSync(fixtureDirectory, { recursive: true, force: true });
	});

	async function resolve(
		env: Record<string, string> = {},
		fileEnv: Record<string, string> = {},
	) {
		for (const key of Object.keys(process.env)) delete process.env[key];
		Object.assign(process.env, initialEnvironment, env);
		writeFileSync(
			fixtureEnv,
			Object.entries(fileEnv)
				.map(([key, value]) => `${key}=${JSON.stringify(value)}`)
				.join("\n"),
		);
		const beforeCalls = dotenvCalls.length;
		const configPath = path.join(fixtureDirectory, `config-${++imports}.ts`);
		const configModule = await import(configPath);
		expect(dotenvCalls.length).toBe(beforeCalls + 1);
		expect(dotenvCalls.at(-1)).toEqual({
			path: path.resolve(realpathSync(fixtureDirectory), "../../.env"),
			override: true,
			quiet: true,
		});
		return configModule.default({ config: { description: "fixture" } });
	}

	const ownedIdentity = {
		APPLE_TEAM_ID: "AB123CD456",
		EXPO_PUBLIC_IOS_BUNDLE_ID: "com.example.owned",
	};
	const ownedExpo = {
		EAS_PROJECT_ID: "11111111-2222-4333-8444-555555555555",
		EAS_OWNER: "owned-example",
	};
	function sentry(config: Awaited<ReturnType<typeof resolve>>) {
		return config.plugins.find(
			(plugin: unknown) =>
				Array.isArray(plugin) && plugin[0] === "@sentry/react-native/expo",
		)[1];
	}

	describe("actual mobile configuration", () => {
		test("shared IOS_APP retains its original shape with initial environment values", () => {
			expect(constants.IOS_APP).toEqual({
				TEAM_ID: process.env.TEST_MOBILE_INITIAL_OWNED
					? "AB123CD456"
					: "NV9657CS5A",
				BUNDLE_ID: process.env.TEST_MOBILE_INITIAL_OWNED
					? "com.example.owned"
					: "sh.superset.mobile",
				APP_ID: process.env.TEST_MOBILE_INITIAL_OWNED
					? "AB123CD456.com.example.owned"
					: "NV9657CS5A.sh.superset.mobile",
			});
		});
		test("default Expo identity, OTA project and owner stay upstream", async () => {
			const config = await resolve();
			expect(config.description).toBe("fixture");
			expect(config.name).toBe("Superset");
			expect(config.scheme).toBe("superset");
			expect(config.version).toBe("1.1.3");
			expect(config.ios.appleTeamId).toBe("NV9657CS5A");
			expect(config.ios.bundleIdentifier).toBe("sh.superset.mobile");
			expect(config.android.package).toBe("sh.superset.mobile");
			expect(config.updates).toEqual({
				url: "https://u.expo.dev/fa9332a8-896a-4d2a-be5b-d82469b46e5d",
			});
			expect(config.extra.eas.projectId).toBe(
				"fa9332a8-896a-4d2a-be5b-d82469b46e5d",
			);
			expect(config.owner).toBe("supserset-sh");
			expect(config.ios).not.toHaveProperty("buildNumber");
			expect(config.ios.usesAppleSignIn).toBe(true);
		});
		test("Authentik-only providers omit Apple sign-in entitlement", async () => {
			const config = await resolve({
				...ownedIdentity,
				EXPO_PUBLIC_AUTH_PROVIDERS: "authentik",
			});
			expect(config.ios.usesAppleSignIn).toBe(false);
			expect(config.plugins).toContain("expo-apple-authentication");
		});
		test("explicit trimmed Apple provider retains Apple sign-in entitlement", async () => {
			const config = await resolve({
				...ownedIdentity,
				EXPO_PUBLIC_AUTH_PROVIDERS: "authentik, Apple ",
			});
			expect(config.ios.usesAppleSignIn).toBe(true);
		});
		test("upstream tablet, locale, runtime and native plugin settings remain", async () => {
			const config = await resolve();
			expect(config.ios.supportsTablet).toBe(true);
			expect(
				config.ios.infoPlist["UISupportedInterfaceOrientations~ipad"],
			).toEqual([
				"UIInterfaceOrientationPortrait",
				"UIInterfaceOrientationPortraitUpsideDown",
				"UIInterfaceOrientationLandscapeLeft",
				"UIInterfaceOrientationLandscapeRight",
			]);
			expect(config.locales).toEqual(
				Object.fromEntries(
					SUPPORTED_LOCALES.map((locale) => [
						locale,
						`./locales/${locale}.json`,
					]),
				),
			);
			expect(config.plugins).toContainEqual([
				"expo-localization",
				{ supportedLocales: { ios: [...SUPPORTED_LOCALES] } },
			]);
			expect(config.plugins[0]).toEqual([accentColor, { color: "#262626" }]);
			expect(config.plugins).toContain("@bacons/apple-targets");
			expect(config.plugins).toContainEqual([
				"expo-build-properties",
				{ ios: { deploymentTarget: "26.0" } },
			]);
			expect(config.plugins).toContain("expo-apple-authentication");
			expect(config.plugins).toContain("expo-updates");
			expect(config.runtimeVersion).toEqual({ policy: "fingerprint" });
		});
		test("default group metadata binds the actual unchanged widget entitlement", async () => {
			const config = await resolve();
			const widget = widgetConfig(config);
			expect(config.ios.infoPlist.SupersetAppGroup).toBe(
				"group.sh.superset.mobile",
			);
			expect(widget.entitlements["com.apple.security.application-groups"]).toBe(
				config.ios.entitlements["com.apple.security.application-groups"],
			);
		});
		test("identity from the fake env file wins after constants were already imported", async () => {
			const config = await resolve({}, ownedIdentity);
			expect(config.ios.appleTeamId).toBe("AB123CD456");
			expect(config.ios.bundleIdentifier).toBe("com.example.owned");
			expect(config.android.package).toBe("com.example.owned");
			expect(
				config.ios.entitlements["com.apple.security.application-groups"],
			).toEqual(["group.com.example.owned"]);
			expect(config.ios.infoPlist.SupersetAppGroup).toBe(
				"group.com.example.owned",
			);
			expect(
				widgetConfig(config).entitlements[
					"com.apple.security.application-groups"
				],
			).toEqual(["group.com.example.owned"]);
		});
		test("real dotenv override preserves current env-file precedence", async () => {
			const config = await resolve(
				{
					APPLE_TEAM_ID: "ZZ987YY654",
					EXPO_PUBLIC_IOS_BUNDLE_ID: "com.example.shell",
				},
				ownedIdentity,
			);
			expect(config.ios.appleTeamId).toBe("AB123CD456");
			expect(config.ios.bundleIdentifier).toBe("com.example.owned");
		});
		test("owned identity omits upstream Expo ownership and disables OTA", async () => {
			const config = await resolve(ownedIdentity);
			expect(config.updates).toEqual({ enabled: false });
			expect(config.extra).not.toHaveProperty("eas");
			expect(config.owner).toBeUndefined();
		});
		for (const env of [
			{ MOBILE_SELF_HOST: "1" },
			{ EXPO_PUBLIC_API_URL: "https://api.example.test" },
			{ APPLE_TEAM_ID: "AB123CD456" },
		]) {
			test(`owned mode defaults OTA off for ${Object.keys(env)[0]}`, async () => {
				const config = await resolve(env);
				expect(config.updates).toEqual({ enabled: false });
				expect(config.extra).not.toHaveProperty("eas");
				expect(config.owner).toBeUndefined();
			});
		}
		test("explicit upstream API leaves the original update settings", async () => {
			const config = await resolve({
				EXPO_PUBLIC_API_URL: "https://api.superset.sh/",
			});
			expect(config.updates.url).toBe(
				"https://u.expo.dev/fa9332a8-896a-4d2a-be5b-d82469b46e5d",
			);
		});
		test("owned app name and build number are optional and scheme stays fixed", async () => {
			const config = await resolve({
				...ownedIdentity,
				EXPO_PUBLIC_APP_NAME: "Owned App",
				MOBILE_BUILD_NUMBER: "42",
			});
			expect(config.name).toBe("Owned App");
			expect(config.ios.buildNumber).toBe("42");
			expect(config.scheme).toBe("superset");
		});
		test("empty optional identity inputs keep upstream defaults", async () => {
			const config = await resolve({
				APPLE_TEAM_ID: " ",
				EXPO_PUBLIC_IOS_BUNDLE_ID: "",
				EXPO_PUBLIC_APP_NAME: " ",
				MOBILE_BUILD_NUMBER: "",
			});
			expect(config.ios.appleTeamId).toBe("NV9657CS5A");
			expect(config.ios.bundleIdentifier).toBe("sh.superset.mobile");
			expect(config.name).toBe("Superset");
			expect(config.ios).not.toHaveProperty("buildNumber");
		});
		for (const web of [
			"https://web.example.test:8443",
			"http://localhost:3000",
		]) {
			test(`associated domains follow existing web-origin rule: ${web}`, async () => {
				const config = await resolve({
					...ownedIdentity,
					EXPO_PUBLIC_WEB_URL: web,
				});
				if (web.startsWith("https:"))
					expect(config.ios.associatedDomains).toEqual([
						"applinks:web.example.test",
					]);
				else expect(config.ios).not.toHaveProperty("associatedDomains");
			});
		}
		for (const dsn of [undefined, "", " "]) {
			test(`native Sentry init is disabled for ${JSON.stringify(dsn)}`, async () => {
				const config = await resolve(
					dsn === undefined ? {} : { EXPO_PUBLIC_SENTRY_DSN_MOBILE: dsn },
				);
				expect(sentry(config).useNativeInit).toBe(false);
				expect(sentry(config).options.dsn).toBeUndefined();
			});
		}
		test("configured Sentry keeps genuine DSN and explicit upload project", async () => {
			const config = await resolve({
				...ownedIdentity,
				EXPO_PUBLIC_SENTRY_DSN_MOBILE: "https://public@sentry.example.test/17",
				SENTRY_ORG: "owned-org",
				SENTRY_PROJECT: "owned-mobile",
			});
			expect(sentry(config).useNativeInit).toBe(true);
			expect(sentry(config).options.dsn).toBe(
				"https://public@sentry.example.test/17",
			);
			expect(sentry(config).organization).toBe("owned-org");
			expect(sentry(config).project).toBe("owned-mobile");
		});
		test("owned Expo metadata does not opt in to OTA", async () => {
			const config = await resolve({ ...ownedIdentity, ...ownedExpo });
			expect(config.updates).toEqual({ enabled: false });
			expect(config.extra.eas.projectId).toBe(ownedExpo.EAS_PROJECT_ID);
			expect(config.owner).toBe(ownedExpo.EAS_OWNER);
		});
		test("owned Expo metadata alone does not inherit automatic upstream OTA", async () => {
			const config = await resolve(ownedExpo);
			expect(config.updates).toEqual({ enabled: false });
			expect(config.extra.eas.projectId).toBe(ownedExpo.EAS_PROJECT_ID);
		});
		test("owned Expo channel alone cannot inherit upstream signing certificate", async () => {
			await expect(
				resolve({
					...ownedExpo,
					MOBILE_UPDATES_ENABLED: "1",
					MOBILE_SIGNED_UPDATES: "1",
					EAS_BUILD_PROFILE: "production",
				}),
			).rejects.toThrow("MOBILE_UPDATES_CERTIFICATE");
		});
		for (const owner of ["supserset-sh", "superset-sh"]) {
			test(`explicit upstream Expo pair preserves default OTA for ${owner}`, async () => {
				const config = await resolve({
					EAS_PROJECT_ID: "fa9332a8-896a-4d2a-be5b-d82469b46e5d",
					EAS_OWNER: owner,
				});
				expect(config.updates).toEqual({
					url: "https://u.expo.dev/fa9332a8-896a-4d2a-be5b-d82469b46e5d",
				});
				expect(config.owner).toBe(owner);
			});
		}
		test("owned OTA uses the explicit owned project", async () => {
			const config = await resolve({
				...ownedIdentity,
				...ownedExpo,
				MOBILE_UPDATES_ENABLED: "1",
			});
			expect(config.updates).toEqual({
				enabled: true,
				url: `https://u.expo.dev/${ownedExpo.EAS_PROJECT_ID}`,
			});
		});
		for (const pair of [
			{ EAS_PROJECT_ID: ownedExpo.EAS_PROJECT_ID },
			{ EAS_OWNER: ownedExpo.EAS_OWNER },
		]) {
			test(`incomplete owned Expo pair refuses ${Object.keys(pair)[0]}`, async () => {
				await expect(resolve({ ...ownedIdentity, ...pair })).rejects.toThrow(
					"EAS_PROJECT_ID and EAS_OWNER",
				);
			});
		}
		for (const pair of [
			{ ...ownedExpo, EAS_PROJECT_ID: "fa9332a8-896a-4d2a-be5b-d82469b46e5d" },
			{ ...ownedExpo, EAS_OWNER: "superset-sh" },
			{ ...ownedExpo, EAS_OWNER: "supserset-sh" },
		]) {
			test(`owned Expo settings reject upstream ${pair.EAS_OWNER}/${pair.EAS_PROJECT_ID}`, async () => {
				await expect(resolve({ ...ownedIdentity, ...pair })).rejects.toThrow(
					"upstream",
				);
			});
		}
		test("owned OTA cannot opt in without an owned Expo project", async () => {
			await expect(
				resolve({ ...ownedIdentity, MOBILE_UPDATES_ENABLED: "1" }),
			).rejects.toThrow("EAS_PROJECT_ID and EAS_OWNER");
		});
		for (const profile of ["preview", "production"]) {
			test(`default ${profile} retains unsigned-update refusal`, async () => {
				await expect(resolve({ EAS_BUILD_PROFILE: profile })).rejects.toThrow(
					"MOBILE_SIGNED_UPDATES=1",
				);
			});
			test(`owned ${profile} with OTA off needs no OTA certificate`, async () => {
				const config = await resolve({
					...ownedIdentity,
					EAS_BUILD_PROFILE: profile,
				});
				expect(config.updates).toEqual({ enabled: false });
			});
			test(`owned ${profile} OTA retains unsigned-update refusal`, async () => {
				await expect(
					resolve({
						...ownedIdentity,
						...ownedExpo,
						MOBILE_UPDATES_ENABLED: "1",
						EAS_BUILD_PROFILE: profile,
					}),
				).rejects.toThrow("MOBILE_SIGNED_UPDATES=1");
			});
		}
		test("default signed updates retain the original certificate", async () => {
			const config = await resolve({
				MOBILE_SIGNED_UPDATES: "1",
				EAS_BUILD_PROFILE: "production",
			});
			expect(config.updates.codeSigningCertificate).toBe(
				"./certs/certificate.pem",
			);
			expect(config.updates.codeSigningMetadata).toEqual({
				keyid: "main",
				alg: "rsa-v1_5-sha256",
			});
		});
		test("signed owned OTA rejects missing owned certificate", async () => {
			await expect(
				resolve({
					...ownedIdentity,
					...ownedExpo,
					MOBILE_UPDATES_ENABLED: "1",
					MOBILE_SIGNED_UPDATES: "1",
					EAS_BUILD_PROFILE: "production",
				}),
			).rejects.toThrow("MOBILE_UPDATES_CERTIFICATE");
		});
		test("signed owned OTA preserves the explicit owned certificate", async () => {
			const config = await resolve({
				...ownedIdentity,
				...ownedExpo,
				MOBILE_UPDATES_ENABLED: "1",
				MOBILE_SIGNED_UPDATES: "1",
				MOBILE_UPDATES_CERTIFICATE: "./certs/owned.pem",
				EAS_BUILD_PROFILE: "production",
			});
			expect(config.updates.codeSigningCertificate).toBe("./certs/owned.pem");
			expect(config.updates.url).toBe(
				`https://u.expo.dev/${ownedExpo.EAS_PROJECT_ID}`,
			);
			expect(config.updates.codeSigningMetadata).toEqual({
				keyid: "main",
				alg: "rsa-v1_5-sha256",
			});
		});
	});
}
