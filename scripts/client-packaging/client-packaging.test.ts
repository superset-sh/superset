import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../..");
const scenario = process.env.PACKAGING_TEST_SCENARIO;
const scratch = fs.mkdtempSync(join(tmpdir(), "superset-packaging-test-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

if (!scenario) {
	for (const name of [
		"runner",
		"desktop-config",
		"bundled-cli",
		"mobile-config",
	]) {
		test(`actual packaging contracts: ${name}`, () => {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.filename],
				{
					cwd: repo,
					env: {
						PATH: process.env.PATH,
						TMPDIR: scratch,
						PACKAGING_TEST_SCENARIO: name,
					},
					timeout: 5_000,
					encoding: "utf8",
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.stdout + child.stderr).toContain("0 fail");
			expect(child.status).toBe(0);
		});
	}
} else if (scenario === "runner") {
	const fixture = join(scratch, "repo");
	const profile = join(scratch, "public.env");
	const profileValues = {
		NEXT_PUBLIC_API_URL: "https://api.example.test",
		NEXT_PUBLIC_WEB_URL: "https://app.example.test",
		NEXT_PUBLIC_MARKETING_URL: "https://example.test",
		NEXT_PUBLIC_DOCS_URL: "https://docs.example.test",
		NEXT_PUBLIC_ROOT_DOMAIN: "example.test",
		NEXT_PUBLIC_DOWNLOAD_URL: "https://download.example.test",
		NEXT_PUBLIC_STREAMS_URL: "https://streams.example.test",
		RELAY_URL: "wss://relay.example.test",
		REALTIME_URL: "wss://realtime.example.test",
		STREAMS_URL: "https://streams-api.example.test",
		UPDATE_FEED_URL: "https://download.example.test/releases",
		CLI_UPDATE_BASE_URL: "https://download.example.test/standalone",
		EXPO_PUBLIC_API_URL: "https://api.example.test",
		EXPO_PUBLIC_WEB_URL: "https://app.example.test",
		EXPO_PUBLIC_RELAY_URL: "wss://relay.example.test",
		EXPO_PUBLIC_REALTIME_URL: "wss://realtime.example.test",
		EXPO_PUBLIC_IOS_BUNDLE_ID: "test.example.mobile",
		APPLE_TEAM_ID: "OWNED12345",
		MOBILE_SELF_HOST: "1",
	};
	type Command = {
		command: string;
		args: string[];
		cwd: string;
		env: NodeJS.ProcessEnv;
	};
	const calls: Command[] = [];
	let failCommand = "";
	let omitChat = false;
	let emptyArtifact = "";
	let emptyRequired = "";
	const put = (path: string, body = "fixture", mode = 0o644) => {
		fs.mkdirSync(dirname(path), { recursive: true });
		fs.writeFileSync(path, body, { mode });
	};
	const writeProfile = (values: Record<string, string> = profileValues) =>
		fs.writeFileSync(
			profile,
			Object.entries(values)
				.map(([key, value]) => `${key}="${value}"`)
				.join("\n"),
		);
	beforeEach(() => {
		fs.rmSync(fixture, { recursive: true, force: true });
		calls.length = 0;
		failCommand = "";
		omitChat = false;
		emptyArtifact = "";
		emptyRequired = "";
		put(
			join(fixture, "apps/desktop/package.json"),
			JSON.stringify({ version: "1.35.0" }),
		);
		put(
			join(fixture, "packages/cli/package.json"),
			JSON.stringify({ version: "1.35.0" }),
		);
		put(join(fixture, ".env"), "UNCHANGED=original\n");
		writeProfile();
	});
	const run = async (request: Command) => {
		calls.push(request);
		const text = request.args.join(" ");
		if (text.includes(failCommand) && failCommand)
			throw Error("Controlled child failure");
		if (request.command === "git")
			return text.includes("status") ? "" : "abcdef0123456789";
		if (text === "--version")
			return request.command.endsWith("superset")
				? `${JSON.parse(fs.readFileSync(join(fixture, "packages/cli/package.json"), "utf8")).version}\n`
				: "fixture-tool\n";
		if (text.includes("compile:app")) {
			put(
				join(fixture, "apps/desktop/dist/main/index.js"),
				JSON.stringify(profileValues),
			);
			put(
				join(fixture, "apps/desktop/dist/renderer/assets/index.js"),
				JSON.stringify(profileValues),
			);
		}
		if (request.args.includes("package")) {
			put(
				join(fixture, "apps/desktop/release/superset-1.35.0-x64.dmg"),
				emptyArtifact === "desktop" ? "" : "fresh package",
			);
			const framework = join(
				fixture,
				"apps/desktop/release/mac/Superset.app/Contents/Frameworks/Electron.framework/Versions",
			);
			fs.mkdirSync(framework, { recursive: true });
			fs.symlinkSync("A", join(framework, "Current"));
		}
		if (text.includes("build:dist")) {
			const target = request.args
				.find((arg) => arg.startsWith("--target="))
				?.slice(9);
			const dist = join(fixture, "packages/cli/dist", `superset-${target}`);
			for (const file of [
				"bin/superset",
				"bin/superset-host",
				"lib/node",
				"lib/host-service.js",
				"lib/host-worker.js",
				"lib/pty-daemon.js",
				"lib/agent-templates/default.txt",
				"lib/node_modules/better-sqlite3/index.js",
				"lib/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
				"lib/node_modules/node-pty/index.js",
				`lib/node_modules/node-pty/${target?.startsWith("darwin") ? `prebuilds/${target}` : "build/Release"}/pty.node`,
				...(target?.startsWith("darwin")
					? [`lib/node_modules/node-pty/prebuilds/${target}/spawn-helper`]
					: []),
				"lib/node_modules/@parcel/watcher/index.js",
				`lib/node_modules/@parcel/watcher-${target}${target?.startsWith("linux") ? "-glibc" : ""}/watcher.node`,
				"share/migrations/0001.sql",
				...(!omitChat ? ["lib/chat-migrations/0001.sql"] : []),
			])
				put(join(dist, file), file === emptyRequired ? "" : "fixture", 0o755);
			put(join(dist, "lib/agent-templates/allowed-empty.txt"), "");
			put(
				join(fixture, "packages/cli/dist", `superset-${target}.tar.gz`),
				"upstream archive",
			);
		}
		if (request.command === "tar")
			put(request.args[1], emptyArtifact === "cli" ? "" : "finalized archive");
		if (request.command.endsWith("/expo") && request.args[0] === "config")
			return JSON.stringify({
				version: "1.1.3",
				ios: {
					bundleIdentifier: profileValues.EXPO_PUBLIC_IOS_BUNDLE_ID,
					appleTeamId: profileValues.APPLE_TEAM_ID,
				},
				updates: { enabled: false },
				extra: {},
			});
		if (request.command.endsWith("/expo") && request.args[0] === "export") {
			const output = request.args[request.args.indexOf("--output-dir") + 1];
			put(
				join(output, "_expo/static/js/ios/bundle.js"),
				JSON.stringify(profileValues),
			);
			put(join(output, "_expo/static/css/global.css"), "");
			if (emptyArtifact === "mobile")
				put(join(output, "_expo/static/js/ios/entry.hbc"), "");
		}
		return "";
	};
	const packageClient = async (args: string[], env: NodeJS.ProcessEnv = {}) => {
		const source = join(import.meta.dir, "client-packaging.ts");
		expect(fs.existsSync(source)).toBe(true);
		const module = await import(source);
		return module.runClientPackaging(args, {
			repoRoot: fixture,
			run,
			env,
			platform: "darwin",
			arch: "arm64",
		});
	};
	test("inherited upload token cannot trigger upstream desktop source-map publication", async () => {
		await packageClient(["desktop", "--compile-only", "--env-file", profile], {
			SENTRY_AUTH_TOKEN: "owned-test-only-token",
		});
		const env = calls.find((call) => call.args.includes("compile:app"))?.env;
		expect(env?.SENTRY_AUTH_TOKEN).toBeFalsy();
		put(
			join(fixture, "apps/desktop/.env"),
			"SENTRY_AUTH_TOKEN=benign-loader-fixture\n",
		);
		const child = spawnSync(
			process.execPath,
			[
				"-e",
				'process.stdout.write(JSON.stringify({ token: process.env.SENTRY_AUTH_TOKEN || "" }))',
			],
			{
				cwd: join(fixture, "apps/desktop"),
				env,
				timeout: 5_000,
				encoding: "utf8",
			},
		);
		expect(child.status).toBe(0);
		expect(JSON.parse(child.stdout).token).toBe("");
	});
	test("desktop package supports normal framework symlinks and binds bundled CLI to selected architecture", async () => {
		const result = await packageClient([
			"desktop",
			"--env-file",
			profile,
			"--mac",
			"--x64",
		]);
		expect(
			result.artifacts.some((artifact: { path: string }) =>
				artifact.path.endsWith("-x64.dmg"),
			),
		).toBe(true);
		expect(
			calls.find((call) => call.args.includes("compile:app"))?.env.TARGET_ARCH,
		).toBe("x64");
		expect(calls.find((call) => call.args.includes("package"))?.args).toEqual([
			"run",
			"package",
			"--",
			"--publish",
			"never",
			"--mac",
			"--x64",
		]);
	});
	test("desktop selected architecture binds compile child and manifest target", async () => {
		const result = await packageClient([
			"desktop",
			"--compile-only",
			"--env-file",
			profile,
			"--x64",
		]);
		expect(
			calls.find((call) => call.args.includes("compile:app"))?.env.TARGET_ARCH,
		).toBe("x64");
		expect(result.targets).toEqual(["darwin-x64"]);
	});
	for (const args of [
		["desktop", "--target=linux-x64"],
		["desktop", "--arm64", "--x64"],
		["mobile", "--all"],
		["cli", "--compile-only"],
	]) {
		test(`inapplicable or contradictory arguments ${args.join(" ")} stop before children`, async () => {
			await expect(
				packageClient([...args, "--env-file", profile]),
			).rejects.toThrow("argument");
			expect(calls).toHaveLength(0);
		});
	}
	for (const inputs of [
		{
			CLI_UPDATE_BASE_URL:
				"https://github.com/superset-sh/superset/releases/download",
		},
		{ NEXT_PUBLIC_API_URL: "https://api.superset.sh" },
		{
			UPDATE_FEED_URL:
				"https://github.com/superset-sh/superset/releases/latest/download",
		},
	]) {
		test(`mixed API/update ownership ${Object.keys(inputs).join()} stops before children`, async () => {
			writeProfile({ ...profileValues, ...inputs });
			await expect(
				packageClient(["desktop", "--env-file", profile]),
			).rejects.toThrow("deployment");
			expect(calls).toHaveLength(0);
		});
	}
	test("CLI hotfix uses the genuine CLI version allowed by upstream version checker", async () => {
		put(
			join(fixture, "packages/cli/package.json"),
			JSON.stringify({ version: "1.35.1" }),
		);
		const result = await packageClient(["cli", "--env-file", profile]);
		expect(result.version).toBe("1.35.1");
		expect(
			fs.readFileSync(join(fixture, "packages/cli/dist/version.txt"), "utf8"),
		).toBe("1.35.1\n");
	});
	test("mobile evidence records the genuine generated Expo version", async () => {
		const result = await packageClient([
			"mobile",
			"--env-file",
			profile,
			"--mode=config",
		]);
		expect(result.version).toBe("1.1.3");
		expect(result.targets).toEqual(["ios"]);
	});
	test("private mobile signing key is rejected before children or public evidence", async () => {
		writeProfile({
			...profileValues,
			MOBILE_SIGNING_PRIVATE_KEY: "test-only-private-material",
		});
		await expect(
			packageClient(["mobile", "--env-file", profile]),
		).rejects.toThrow("MOBILE_SIGNING_PRIVATE_KEY");
		expect(calls).toHaveLength(0);
	});
	test("nonsecret Sentry routing and host DSN remain genuine forwarded build inputs", async () => {
		writeProfile({
			...profileValues,
			SENTRY_ORG: "owned-test-org",
			SENTRY_PROJECT: "owned-test-project",
			SENTRY_DSN_HOST_SERVICE: "https://public@example.test/1",
		});
		await packageClient(["mobile", "--env-file", profile]);
		const env = calls.find((call) => call.command.endsWith("/expo"))?.env;
		expect(env?.SENTRY_ORG).toBe("owned-test-org");
		expect(env?.SENTRY_PROJECT).toBe("owned-test-project");
		expect(env?.SENTRY_DSN_HOST_SERVICE).toBe("https://public@example.test/1");
	});
	test("canonical standalone CLI profile reaches its genuine build env", async () => {
		const inputs: Record<string, string> = {
			...profileValues,
			SUPERSET_API_URL: profileValues.NEXT_PUBLIC_API_URL,
			SUPERSET_WEB_URL: profileValues.NEXT_PUBLIC_WEB_URL,
		};
		delete inputs.NEXT_PUBLIC_API_URL;
		delete inputs.NEXT_PUBLIC_WEB_URL;
		writeProfile(inputs);
		const result = await packageClient(["cli", "--env-file", profile]);
		const env = calls.find((call) => call.args.includes("build:dist"))?.env;
		expect(env?.SUPERSET_API_URL).toBe(inputs.SUPERSET_API_URL);
		expect(env?.SUPERSET_WEB_URL).toBe(inputs.SUPERSET_WEB_URL);
		expect(result.publicInputs.SUPERSET_API_URL).toBe(inputs.SUPERSET_API_URL);
	});
	for (const key of ["SUPERSET_API_URL", "SUPERSET_WEB_URL"]) {
		test(`conflicting canonical CLI ${key} rejects before children`, async () => {
			writeProfile({
				...profileValues,
				[key]: "https://different.example.test",
			});
			await expect(
				packageClient(["cli", "--env-file", profile]),
			).rejects.toThrow(key);
			expect(calls).toHaveLength(0);
		});
	}
	test("compile dispatch retains upstream hooks and selects the same absolute profile", async () => {
		const result = await packageClient([
			"desktop",
			"--compile-only",
			"--env-file",
			profile,
		]);
		expect(
			calls
				.filter((call) => call.command === "bun")
				.map((call) => call.args.join(" ")),
		).toEqual([
			"scripts/release/check-versions.ts",
			"run clean:dev",
			"run generate:icons",
			"run compile:app",
		]);
		const compile = calls.find((call) => call.args.includes("compile:app"));
		expect(compile?.env.SUPERSET_BUILD_ENV_FILE).toBe(profile);
		expect(compile?.env.CLI_UPDATE_BASE_URL).toBe(
			profileValues.CLI_UPDATE_BASE_URL,
		);
		expect(compile?.env.NODE_ENV).toBe("production");
		expect(result.pendingAcceptance).toContain("desktop-packaged-runtime");
		expect(fs.readFileSync(join(fixture, ".env"), "utf8")).toBe(
			"UNCHANGED=original\n",
		);
	});
	test("desktop compile dispatch does not require unused stream origins", async () => {
		const inputs: Record<string, string> = { ...profileValues };
		delete inputs.NEXT_PUBLIC_STREAMS_URL;
		delete inputs.STREAMS_URL;
		writeProfile(inputs);
		const result = await packageClient([
			"desktop",
			"--compile-only",
			"--env-file",
			profile,
		]);
		const compile = calls.find((call) => call.args.includes("compile:app"));
		if (!compile) throw Error("Expected desktop compile dispatch");
		expect(compile.env.SUPERSET_BUILD_ENV_FILE).toBe(profile);
		expect(compile.env.NEXT_PUBLIC_STREAMS_URL).toBeUndefined();
		expect(compile.env.STREAMS_URL).toBeUndefined();
		expect(result.pendingAcceptance).toContain("desktop-packaged-runtime");
	});
	test("failed compile stops dispatch and leaves root dotenv untouched", async () => {
		failCommand = "compile:app";
		await expect(
			packageClient(["desktop", "--env-file", profile]),
		).rejects.toThrow("Controlled child failure");
		expect(calls.some((call) => call.args.includes("package"))).toBe(false);
		expect(fs.readFileSync(join(fixture, ".env"), "utf8")).toBe(
			"UNCHANGED=original\n",
		);
	});
	for (const [key, value] of [
		["CLI_UPDATE_BASE_URL", ""],
		["NEXT_PUBLIC_API_URL", "http://127.0.0.1:3000"],
		[
			"UPDATE_FEED_URL",
			"https://user:password@example.test/private?token=secret",
		],
		["NEXT_PUBLIC_WEB_URL", "wss://app.example.test"],
		["NEXT_PUBLIC_API_URL", "https://127.0.0.2"],
		["NEXT_PUBLIC_API_URL", "https://service.localhost"],
	]) {
		test(`invalid ${key} stops before child dispatch without exposing its value`, async () => {
			writeProfile({ ...profileValues, [key]: value });
			let message = "";
			try {
				await packageClient(["desktop", "--env-file", profile]);
			} catch (error) {
				message = String(error);
			}
			expect(message).toContain(key);
			expect(message).not.toContain("password");
			expect(message).not.toContain("token=secret");
			expect(calls).toHaveLength(0);
		});
	}
	test("CLI delegates assembly and finalizes version plus byte-bound updater sidecars", async () => {
		const result = await packageClient([
			"cli",
			"--env-file",
			profile,
			"--target=darwin-arm64",
		]);
		expect(
			calls
				.filter((call) => call.args.includes("build:dist"))
				.map((call) => call.args),
		).toEqual([["run", "build:dist", "--target=darwin-arm64"]]);
		expect(
			fs.readFileSync(
				join(
					fixture,
					"packages/cli/dist/superset-darwin-arm64/share/version.txt",
				),
				"utf8",
			),
		).toBe("1.35.0\n");
		const archive = fs.readFileSync(
			join(fixture, "packages/cli/dist/superset-darwin-arm64.tar.gz"),
		);
		const digest = createHash("sha256").update(archive).digest("hex");
		expect(
			fs.readFileSync(
				join(fixture, "packages/cli/dist/sha256sums.txt"),
				"utf8",
			),
		).toBe(`${digest}  superset-darwin-arm64.tar.gz\n`);
		expect(
			result.artifacts.find((artifact: { path: string }) =>
				artifact.path.endsWith(".tar.gz"),
			),
		).toMatchObject({ sha256: digest, size: archive.length });
		expect(result.pendingAcceptance).toContain("cli-native-smoke");
	});
	test("missing upstream chat migration closure blocks CLI finalization", async () => {
		omitChat = true;
		await expect(packageClient(["cli", "--env-file", profile])).rejects.toThrow(
			"chat-migrations",
		);
		expect(calls.some((call) => call.command === "tar")).toBe(false);
	});
	for (const file of [
		"bin/superset-host",
		"lib/host-worker.js",
		"lib/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
		"share/migrations/0001.sql",
	]) {
		test(`truncated required CLI artifact refuses finalization: ${file}`, async () => {
			emptyRequired = file;
			await expect(
				packageClient(["cli", "--env-file", profile, "--target=darwin-arm64"]),
			).rejects.toThrow("Missing regular artifact");
			expect(calls.some((call) => call.command === "tar")).toBe(false);
		});
	}
	test("foreign CLI target retains explicit native runtime acceptance", async () => {
		const result = await packageClient([
			"cli",
			"--env-file",
			profile,
			"--target=linux-x64",
		]);
		expect(calls.some((call) => call.command.endsWith("bin/superset"))).toBe(
			false,
		);
		expect(result.pendingAcceptance).toContain("cli-native-runtime:linux-x64");
	});
	test("mobile export uses installed Expo and a complete owned output record", async () => {
		const output = join(scratch, "export");
		const result = await packageClient([
			"mobile",
			"--env-file",
			profile,
			"--mode=export",
			"--output-dir",
			output,
		]);
		expect(calls.find((call) => call.args.includes("export"))?.command).toBe(
			join(fixture, "apps/mobile/node_modules/.bin/expo"),
		);
		expect(
			result.artifacts.some((artifact: { path: string }) =>
				artifact.path.endsWith("bundle.js"),
			),
		).toBe(true);
		expect(result.pendingAcceptance).toContain(
			"mobile-native-and-physical-device",
		);
	});
	test("mobile export records an empty generated stylesheet with its byte hash", async () => {
		const result = await packageClient([
			"mobile",
			"--env-file",
			profile,
			"--mode=export",
			"--output-dir",
			join(scratch, "empty-css-export"),
		]);
		expect(
			result.artifacts.find((artifact: { path: string }) =>
				artifact.path.endsWith("global.css"),
			),
		).toMatchObject({
			size: 0,
			sha256: createHash("sha256").update("").digest("hex"),
		});
	});
	for (const kind of ["desktop", "cli", "mobile"]) {
		test(`empty ${kind} installer or native bundle remains invalid`, async () => {
			emptyArtifact = kind;
			const args = [kind, "--env-file", profile];
			if (kind === "mobile")
				args.push(
					"--mode=export",
					"--output-dir",
					join(scratch, "empty-hbc-export"),
				);
			await expect(packageClient(args)).rejects.toThrow(
				"Missing regular artifact",
			);
		});
	}

	test("unsupported mobile modes never start build children", async () => {
		await expect(
			packageClient(["mobile", "--env-file", profile, "--mode=unknown"]),
		).rejects.toThrow("Unsupported mobile packaging mode");
		expect(calls).toHaveLength(0);
	});

	for (const [name, mode] of [
		["package-desktop-selfhost.sh", "desktop"],
		["package-cli-selfhost.sh", "cli"],
		["build-desktop-selfhost.sh", "desktop"],
		["build-mobile-selfhost.sh", "mobile"],
	]) {
		test(`actual ${name} forwards arguments without shell-evaluating profile content`, () => {
			const fakeBin = join(scratch, "bin");
			const capture = join(scratch, "launcher-args.json");
			put(
				join(fakeBin, "bun"),
				`#!${process.execPath}\nawait Bun.write(process.env.CAPTURE, JSON.stringify(process.argv.slice(2)));\n`,
				0o755,
			);
			const script = join(repo, "scripts", name);
			expect(fs.existsSync(script)).toBe(true);
			const result = spawnSync(
				"/bin/bash",
				[script, "--env-file", "space and $(false).env"],
				{
					env: { PATH: `${fakeBin}:/usr/bin:/bin`, CAPTURE: capture },
					encoding: "utf8",
				},
			);
			expect(result.status).toBe(0);
			const args = JSON.parse(fs.readFileSync(capture, "utf8"));
			expect(args).toContain(mode);
			expect(args.slice(-2)).toEqual(["--env-file", "space and $(false).env"]);
			if (name === "build-desktop-selfhost.sh")
				expect(args).toContain("--compile-only");
		});
	}
} else {
	const profile = join(scratch, "selected.env");
	const loads: Array<{ path: string; override: boolean; quiet: boolean }> = [];
	let lastChild: NodeJS.ProcessEnv | undefined;
	const dotenv = (await import("node:module")).createRequire(
		join(repo, "apps/desktop/package.json"),
	)("dotenv");
	mock.module("dotenv", () => ({
		config: (options: { path: string; override: boolean; quiet: boolean }) => {
			loads.push(options);
			const parsed =
				options.path === profile ? dotenv.parse(fs.readFileSync(profile)) : {};
			for (const [key, value] of Object.entries(parsed))
				if (options.override || process.env[key] === undefined)
					process.env[key] = String(value);
			return { parsed };
		},
	}));
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Network denied");
		},
		{
			preconnect() {
				throw Error("Network denied");
			},
		},
	);
	const defaults = { ...process.env };
	if (scenario === "desktop-config") {
		for (const [name, exported] of [
			["@sentry/vite-plugin", "sentryVitePlugin"],
			["@tanstack/router-plugin/vite", "tanstackRouter"],
		])
			mock.module(name, () => ({ [exported]: () => ({}) }));
		for (const name of [
			"@tailwindcss/vite",
			"@vitejs/plugin-react",
			"rollup-plugin-inject-process-env",
			"vite-tsconfig-paths",
		])
			mock.module(name, () => ({ default: () => ({}) }));
		mock.module("electron-vite", () => ({
			defineConfig: (value: unknown) => value,
			externalizeDepsPlugin: () => ({}),
		}));
		mock.module(join(repo, "apps/desktop/src/main/env.main.ts"), () => ({}));
		mock.module(join(repo, "apps/desktop/vite/helpers.ts"), () => ({
			copyResourcesPlugin: () => ({}),
			defineEnv: (value: string | undefined, fallback = "") =>
				JSON.stringify(value ?? fallback),
			devPath: "fixture",
			htmlEnvTransformPlugin: () => ({}),
			linguiMacroPlugin: () => ({}),
		}));
	} else if (scenario === "bundled-cli") {
		const actualFs = { ...fs };
		mock.module("node:fs", () => ({
			...actualFs,
			mkdirSync: () => undefined,
			chmodSync: () => undefined,
		}));
		mock.module("node:child_process", () => ({
			spawn: (
				_command: string,
				_args: string[],
				options: { env: NodeJS.ProcessEnv },
			) => {
				lastChild = options.env;
				const child = new EventEmitter();
				queueMicrotask(() => child.emit("exit", 0));
				return child;
			},
		}));
	}
	for (const selected of [false, true]) {
		test(`${scenario} ${selected ? "selected" : "default"} file preserves existing dotenv override semantics`, async () => {
			for (const key of Object.keys(process.env)) delete process.env[key];
			Object.assign(process.env, defaults, {
				NEXT_PUBLIC_API_URL: "https://inherited.example.test",
				EXPO_PUBLIC_WEB_URL: "https://inherited.example.test",
				TARGET_PLATFORM: "darwin",
				TARGET_ARCH: "arm64",
			});
			fs.writeFileSync(
				profile,
				'NEXT_PUBLIC_API_URL="https://selected.example.test"\nEXPO_PUBLIC_WEB_URL="https://selected.example.test"\nCLI_UPDATE_BASE_URL="https://download.example.test/explicit-cli"\nEXPO_PUBLIC_IOS_BUNDLE_ID="test.example.mobile"\nAPPLE_TEAM_ID="OWNED12345"\nMOBILE_SELF_HOST="1"\n',
			);
			if (selected) process.env.SUPERSET_BUILD_ENV_FILE = profile;
			else delete process.env.SUPERSET_BUILD_ENV_FILE;
			const path =
				scenario === "desktop-config"
					? "apps/desktop/electron.vite.config.ts"
					: scenario === "bundled-cli"
						? "apps/desktop/scripts/build-bundled-cli.ts"
						: "apps/mobile/app.config.ts";
			const config = (await import(`${join(repo, path)}?packaging=${selected}`))
				.default;
			expect(loads.at(-1)).toEqual({
				path: selected ? profile : join(repo, ".env"),
				override: scenario !== "bundled-cli",
				quiet: true,
			});
			if (scenario === "desktop-config")
				expect(config.main.define["process.env.NEXT_PUBLIC_API_URL"]).toBe(
					JSON.stringify(
						selected
							? "https://selected.example.test"
							: "https://inherited.example.test",
					),
				);
			if (scenario === "bundled-cli") {
				expect(lastChild?.SUPERSET_API_URL).toBe(
					"https://inherited.example.test",
				);
				expect(lastChild?.SUPERSET_CLI_CHANNEL).toBe("desktop-bundled");
				if (selected)
					expect(lastChild?.CLI_UPDATE_BASE_URL).toBe(
						"https://download.example.test/explicit-cli",
					);
			}
			if (scenario === "mobile-config") {
				const effective = config({ config: {} });
				expect(effective.ios.associatedDomains).toEqual([
					`applinks:${selected ? "selected" : "inherited"}.example.test`,
				]);
				if (selected) {
					expect(effective.ios.bundleIdentifier).toBe("test.example.mobile");
					expect(effective.updates.enabled).toBe(false);
				}
			}
		});
	}
}
