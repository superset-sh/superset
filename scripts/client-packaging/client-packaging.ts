import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	createReadStream,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { isIP } from "node:net";
import { dirname, join, relative, resolve } from "node:path";

type Command = {
	command: string;
	args: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
};
type Runner = (command: Command) => Promise<string>;
type Artifact = { path: string; size: number; sha256: string };
type Options = {
	repoRoot?: string;
	run?: Runner;
	env?: NodeJS.ProcessEnv;
	platform?: string;
	arch?: string;
};
const root = resolve(import.meta.dir, "../..");
const targets = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"];
const dotenv = createRequire(join(root, "apps/desktop/package.json"))(
	"dotenv",
) as { parse: (input: Buffer) => Record<string, string> };

export async function runProcess(request: Command): Promise<string> {
	return new Promise((accept, reject) => {
		const capture =
			request.command === "git" ||
			request.args[0] === "--version" ||
			request.args[0] === "config";
		const child = spawn(request.command, request.args, {
			cwd: request.cwd,
			env: request.env,
			stdio: ["ignore", "pipe", "inherit"],
		});
		let output = "";
		child.stdout.on("data", (chunk: Buffer) => {
			if (capture) output += chunk.toString();
			else process.stdout.write(chunk);
		});
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0
				? accept(output)
				: reject(Error(`${request.command} failed with exit ${code}`)),
		);
	});
}

function argumentsFor(args: string[]) {
	const kind = args[0];
	if (!["desktop", "cli", "mobile"].includes(kind))
		throw Error("Select desktop, cli or mobile");
	const values = new Map<string, string>();
	const flags = new Set<string>();
	const selected: string[] = [];
	for (let i = 1; i < args.length; i++) {
		const [key, ...parts] = args[i].split("=");
		if (
			[
				"--compile-only",
				"--mac",
				"--linux",
				"--arm64",
				"--x64",
				"--unsigned",
				"--all",
			].includes(key)
		) {
			if (parts.length) throw Error(`Unexpected value for ${key}`);
			flags.add(key);
			continue;
		}
		if (
			![
				"--env-file",
				"--target",
				"--mode",
				"--output-dir",
				"--device",
				"--configuration",
			].includes(key)
		)
			throw Error(`Unknown argument ${key}`);
		const value = parts.length ? parts.join("=") : args[++i];
		if (!value || value.startsWith("--"))
			throw Error(`Missing value for ${key}`);
		if (key === "--target") selected.push(...value.split(","));
		else {
			if (values.has(key)) throw Error(`Duplicate argument ${key}`);
			values.set(key, value);
		}
	}
	const mode = values.get("--mode") || "config";
	const kindFlags: Record<string, string[]> = {
		desktop: [
			"--compile-only",
			"--mac",
			"--linux",
			"--arm64",
			"--x64",
			"--unsigned",
		],
		cli: ["--all"],
		mobile: [],
	};
	const kindValues: Record<string, string[]> = {
		desktop: [],
		cli: [],
		mobile: ["--mode", "--output-dir", "--device", "--configuration"],
	};
	if (
		[...flags].some((flag) => !kindFlags[kind].includes(flag)) ||
		[...values.keys()].some(
			(key) => key !== "--env-file" && !kindValues[kind].includes(key),
		) ||
		(kind !== "cli" && selected.length)
	)
		throw Error("Inapplicable packaging argument");
	if (
		(flags.has("--arm64") && flags.has("--x64")) ||
		(flags.has("--mac") && flags.has("--linux")) ||
		(flags.has("--all") && selected.length)
	)
		throw Error("Contradictory packaging arguments");
	if (
		kind === "mobile" &&
		!["config", "export", "simulator", "device"].includes(mode)
	)
		throw Error("Unsupported mobile packaging mode");
	if (kind === "mobile") {
		if (
			(values.has("--output-dir") && mode !== "export") ||
			(["--device", "--configuration"].some((key) => values.has(key)) &&
				!["device", "simulator"].includes(mode))
		)
			throw Error("Inapplicable mobile mode argument");
		if (["device", "simulator"].includes(mode) && !values.has("--device"))
			throw Error(
				"Pass --device with an explicit simulator or device identifier",
			);
		if (
			values.has("--configuration") &&
			!["Release", "Debug"].includes(values.get("--configuration") as string)
		)
			throw Error("Unsupported iOS configuration argument");
	}
	if (!values.has("--env-file"))
		throw Error("Pass --env-file with a public build profile");
	return { kind, mode, values, flags, selected };
}

function requireUrl(values: Record<string, string>, key: string) {
	try {
		const url = new URL(values[key]);
		const protocols =
			key.includes("RELAY") || key.includes("REALTIME")
				? ["https:", "wss:"]
				: ["https:"];
		const loopback =
			url.hostname === "localhost" ||
			url.hostname.endsWith(".localhost") ||
			(isIP(url.hostname) === 4 && url.hostname.startsWith("127.")) ||
			url.hostname === "[::1]";
		if (
			!protocols.includes(url.protocol) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			loopback
		)
			throw Error();
	} catch {
		throw Error(`Invalid public build input ${key}`);
	}
}

function profileFor(path: string, kind: string) {
	const values = dotenv.parse(readFileSync(path));
	if (kind === "cli") {
		for (const [canonical, fallback] of [
			["SUPERSET_API_URL", "NEXT_PUBLIC_API_URL"],
			["SUPERSET_WEB_URL", "NEXT_PUBLIC_WEB_URL"],
		]) {
			if (
				values[canonical] &&
				values[fallback] &&
				values[canonical] !== values[fallback]
			)
				throw Error(`Conflicting public build input ${canonical}`);
			values[canonical] = values[canonical] || values[fallback];
			values[fallback] = values[canonical];
		}
	}
	const required =
		kind === "mobile"
			? [
					"EXPO_PUBLIC_API_URL",
					"EXPO_PUBLIC_WEB_URL",
					"EXPO_PUBLIC_RELAY_URL",
					"EXPO_PUBLIC_REALTIME_URL",
				]
			: kind === "cli"
				? [
						"SUPERSET_API_URL",
						"SUPERSET_WEB_URL",
						"RELAY_URL",
						"CLI_UPDATE_BASE_URL",
					]
				: [
						"NEXT_PUBLIC_API_URL",
						"NEXT_PUBLIC_WEB_URL",
						"RELAY_URL",
						"CLI_UPDATE_BASE_URL",
					];
	if (kind === "desktop")
		required.push(
			"NEXT_PUBLIC_MARKETING_URL",
			"NEXT_PUBLIC_DOCS_URL",
			"NEXT_PUBLIC_DOWNLOAD_URL",
			"REALTIME_URL",
			"UPDATE_FEED_URL",
		);
	for (const key of required) requireUrl(values, key);
	if (kind !== "mobile") {
		const upstreamApi =
			values.NEXT_PUBLIC_API_URL.replace(/\/$/, "") ===
			"https://api.superset.sh";
		const upstreamCli =
			values.CLI_UPDATE_BASE_URL.replace(/\/$/, "") ===
			"https://github.com/superset-sh/superset/releases/download";
		if (upstreamApi !== upstreamCli)
			throw Error(
				"API and CLI update channel must match the deployment category",
			);
		if (kind === "desktop") {
			const upstreamDesktop = [
				"https://github.com/superset-sh/superset/releases/latest/download",
				"https://github.com/superset-sh/superset/releases/download/desktop-canary",
			].includes(values.UPDATE_FEED_URL.replace(/\/$/, ""));
			if (upstreamApi !== upstreamDesktop)
				throw Error(
					"API and desktop update channel must match the deployment category",
				);
		}
	}
	for (const key of [
		"SANDBOX_GATE_ORIGIN",
		"R2_ENDPOINT",
		"S3_PRESIGN_ENDPOINT",
		"S3_ENDPOINT",
	])
		if (values[key]) requireUrl(values, key);
	if (kind === "desktop" && !values.NEXT_PUBLIC_ROOT_DOMAIN?.trim())
		throw Error("Missing public build input NEXT_PUBLIC_ROOT_DOMAIN");
	if (
		kind === "mobile" &&
		(!values.EXPO_PUBLIC_IOS_BUNDLE_ID?.trim() || !values.APPLE_TEAM_ID?.trim())
	)
		throw Error("Mobile packaging requires an explicit owned iOS identity");
	const allowed =
		/^(NEXT_PUBLIC_|EXPO_PUBLIC_|SUPERSET_(API_URL|WEB_URL)$|CLI_UPDATE_BASE_URL$|UPDATE_FEED_URL$|RELAY_URL$|REALTIME_URL$|STREAMS_URL$|SANDBOX_GATE_ORIGIN$|R2_ENDPOINT$|S3_(PRESIGN_ENDPOINT|ENDPOINT)$|MOBILE_(SELF_HOST|UPDATES_ENABLED|SIGNED_UPDATES|UPDATES_CERTIFICATE|BUILD_NUMBER)$|APPLE_TEAM_ID$|EAS_(PROJECT_ID|OWNER|BUILD_PROFILE)$|SENTRY_(DSN_DESKTOP|DSN_HOST_SERVICE|ORG|PROJECT)$|DESKTOP_(VITE_PORT|NOTIFICATIONS_PORT)$)/;
	for (const key of Object.keys(values))
		if (!allowed.test(key))
			throw Error(`Unsupported public build input ${key}`);
	return values;
}

function filesAt(path: string): string[] {
	if (!existsSync(path)) return [];
	const stat = lstatSync(path);
	if (stat.isSymbolicLink())
		throw Error(`Artifact symlink is unsupported: ${path}`);
	if (stat.isFile()) return [path];
	return readdirSync(path)
		.sort()
		.flatMap((entry) => filesAt(join(path, entry)));
}

async function artifactAt(
	path: string,
	base: string,
	allowEmpty = false,
): Promise<Artifact> {
	const stat = lstatSync(path);
	if (!stat.isFile() || (!allowEmpty && stat.size === 0))
		throw Error(`Missing regular artifact: ${path}`);
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(path, {
		highWaterMark: 64 * 1024,
	}))
		hash.update(chunk);
	return {
		path: relative(base, path),
		size: stat.size,
		sha256: hash.digest("hex"),
	};
}

async function artifactsAt(paths: string[], base: string): Promise<Artifact[]> {
	const result: Artifact[] = [];
	for (const path of paths) result.push(await artifactAt(path, base));
	return result;
}

function desktopArtifacts(path: string): string[] {
	if (!existsSync(path)) return [];
	return readdirSync(path, { withFileTypes: true })
		.filter(
			(entry) =>
				/\.(dmg|zip|AppImage|deb|yml|blockmap)$/.test(entry.name) &&
				!entry.isDirectory(),
		)
		.map((entry) => join(path, entry.name))
		.sort();
}

function requireFiles(path: string, entries: string[]) {
	for (const entry of entries) {
		const full = join(path, entry);
		if (filesAt(full).length === 0)
			throw Error(`Missing distribution output ${entry}`);
	}
}

function requireRegularFiles(path: string, entries: string[]) {
	for (const entry of entries) {
		const full = join(path, entry);
		if (
			!existsSync(full) ||
			!lstatSync(full).isFile() ||
			lstatSync(full).size === 0
		)
			throw Error(`Missing regular artifact: ${entry}`);
	}
}

function requireMigrations(path: string, directory: string) {
	const migrations = filesAt(join(path, directory)).filter((file) =>
		file.endsWith(".sql"),
	);
	if (migrations.length === 0)
		throw Error(`Missing distribution output ${directory}`);
	requireRegularFiles(
		path,
		migrations.map((file) => relative(path, file)),
	);
}

export async function runClientPackaging(
	args: string[],
	options: Options = {},
) {
	const { kind, mode, flags, values, selected } = argumentsFor(args);
	const repoRoot = options.repoRoot || root;
	const profile = resolve(values.get("--env-file") as string);
	const inputs = profileFor(profile, kind);
	const platform = options.platform || process.platform;
	const arch = options.arch || process.arch;
	const native = `${platform}-${arch}`;
	const desktopArch = flags.has("--x64")
		? "x64"
		: flags.has("--arm64")
			? "arm64"
			: arch;
	const requested = flags.has("--all")
		? targets
		: selected.length
			? [...new Set(selected)]
			: [native];
	if (kind === "cli" && requested.some((target) => !targets.includes(target)))
		throw Error("Unsupported CLI target");
	if (
		kind === "desktop" &&
		((flags.has("--mac") && platform !== "darwin") ||
			(flags.has("--linux") && platform !== "linux") ||
			!["darwin", "linux"].includes(platform))
	)
		throw Error("Desktop packaging requires a matching native platform");
	const env: NodeJS.ProcessEnv = {
		...(options.env ?? process.env),
		...inputs,
		NODE_ENV: "production",
		SUPERSET_BUILD_ENV_FILE: profile,
	};
	env.SENTRY_AUTH_TOKEN = "";
	if (kind === "desktop") {
		env.TARGET_PLATFORM = platform;
		env.TARGET_ARCH = desktopArch;
	}
	if (kind !== "mobile") {
		env.SUPERSET_API_URL = inputs.NEXT_PUBLIC_API_URL;
		env.SUPERSET_WEB_URL = inputs.NEXT_PUBLIC_WEB_URL;
	}
	if (flags.has("--unsigned")) env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
	const execute = options.run || runProcess;
	const run = (command: string, commandArgs: string[], cwd = repoRoot) =>
		execute({ command, args: commandArgs, cwd, env });
	const dirty = (await run("git", ["status", "--porcelain"])).trim();
	if (dirty && !flags.has("--compile-only"))
		throw Error("Packaging requires a committed clean source tree");
	const sourceRevision = (await run("git", ["rev-parse", "HEAD"])).trim();
	await run("bun", ["scripts/release/check-versions.ts"]);
	let version = JSON.parse(
		readFileSync(
			join(
				repoRoot,
				kind === "cli"
					? "packages/cli/package.json"
					: "apps/desktop/package.json",
			),
			"utf8",
		),
	).version as string;
	const artifacts: Artifact[] = [];
	const pendingAcceptance: string[] = [];
	const cwd = join(repoRoot, kind === "cli" ? "packages/cli" : `apps/${kind}`);
	if (kind === "desktop") {
		await run("bun", ["run", "clean:dev"], cwd);
		await run("bun", ["run", "generate:icons"], cwd);
		await run("bun", ["run", "compile:app"], cwd);
		const main = join(cwd, "dist/main/index.js");
		const renderer = filesAt(join(cwd, "dist/renderer"));
		requireFiles(cwd, ["dist/main/index.js", "dist/renderer"]);
		for (const key of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_WEB_URL"]) {
			if (
				!readFileSync(main, "utf8").includes(inputs[key]) ||
				!renderer.some((file) =>
					readFileSync(file, "utf8").includes(inputs[key]),
				)
			)
				throw Error(`Compiled desktop output is missing ${key}`);
		}
		artifacts.push(...(await artifactsAt([main, ...renderer], repoRoot)));
		if (!flags.has("--compile-only")) {
			const release = join(cwd, "release");
			const before = new Map(
				(await artifactsAt(desktopArtifacts(release), repoRoot)).map((item) => [
					item.path,
					item.sha256,
				]),
			);
			await run(
				"bun",
				[
					"run",
					"package",
					"--",
					"--publish",
					"never",
					platform === "darwin" ? "--mac" : "--linux",
					`--${desktopArch}`,
				],
				cwd,
			);
			const output = (
				await artifactsAt(desktopArtifacts(release), repoRoot)
			).filter((item) => before.get(item.path) !== item.sha256);
			if (!output.some((item) => /\.(dmg|zip|AppImage|deb)$/.test(item.path)))
				throw Error("No fresh desktop package artifact was produced");
			artifacts.push(...output);
		}
		pendingAcceptance.push(
			"desktop-packaged-runtime",
			"desktop-update-manifest-and-feed",
			"desktop-signature-and-notarization",
			"desktop-native-resources",
		);
	} else if (kind === "cli") {
		const sums: string[] = [];
		for (const target of requested) {
			await run("bun", ["run", "build:dist", `--target=${target}`], cwd);
			const staging = join(cwd, "dist", `superset-${target}`);
			requireRegularFiles(staging, [
				"bin/superset",
				"bin/superset-host",
				"lib/node",
				"lib/host-service.js",
				"lib/host-worker.js",
				"lib/pty-daemon.js",
				"lib/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
				`lib/node_modules/node-pty/${target.startsWith("darwin") ? `prebuilds/${target}` : "build/Release"}/pty.node`,
				`lib/node_modules/@parcel/watcher-${target}${target.startsWith("linux") ? "-glibc" : ""}/watcher.node`,
				...(target.startsWith("darwin")
					? [`lib/node_modules/node-pty/prebuilds/${target}/spawn-helper`]
					: []),
			]);
			requireMigrations(staging, "share/migrations");
			requireMigrations(staging, "lib/chat-migrations");
			requireFiles(staging, [
				"bin/superset",
				"bin/superset-host",
				"lib/node",
				"lib/host-service.js",
				"lib/host-worker.js",
				"lib/pty-daemon.js",
				"lib/node_modules/better-sqlite3",
				"lib/node_modules/node-pty",
				"lib/node_modules/@parcel/watcher",
				"lib/agent-templates",
				"share/migrations",
				"lib/chat-migrations",
			]);
			if (target === native) {
				if (
					(
						await run(join(staging, "bin/superset"), ["--version"], staging)
					).trim() !== version
				)
					throw Error("CLI binary version does not match release version");
			} else pendingAcceptance.push(`cli-native-runtime:${target}`);
			writeFileSync(join(staging, "share/version.txt"), `${version}\n`);
			const archive = join(cwd, "dist", `superset-${target}.tar.gz`);
			await run("tar", ["-czf", archive, "-C", staging, "."]);
			const artifact = await artifactAt(archive, repoRoot);
			artifacts.push(artifact);
			sums.push(`${artifact.sha256}  superset-${target}.tar.gz`);
		}
		for (const [file, body] of [
			["sha256sums.txt", `${sums.join("\n")}\n`],
			["version.txt", `${version}\n`],
		]) {
			const path = join(cwd, "dist", file);
			writeFileSync(path, body);
			artifacts.push(await artifactAt(path, repoRoot));
		}
		pendingAcceptance.push(
			"cli-native-smoke",
			"cli-headless-host-and-chat",
			"cli-update-channel-controls",
			"cli-native-addons-and-helpers",
		);
	} else {
		const expo = join(cwd, "node_modules/.bin/expo");
		const config = JSON.parse(await run(expo, ["config", "--json"], cwd));
		version = config.version;
		if (typeof version !== "string" || !version)
			throw Error("Generated Expo config is missing its application version");
		if (
			config.ios?.bundleIdentifier !== inputs.EXPO_PUBLIC_IOS_BUNDLE_ID ||
			config.ios?.appleTeamId !== inputs.APPLE_TEAM_ID
		)
			throw Error("Generated Expo config does not match selected iOS identity");
		if (
			inputs.MOBILE_UPDATES_ENABLED !== "1" &&
			config.updates?.enabled !== false
		)
			throw Error(
				"Owned mobile OTA must remain disabled unless explicitly enabled",
			);
		if (mode === "export") {
			const output = resolve(
				values.get("--output-dir") || join(cwd, "dist-selfhost"),
			);
			if (existsSync(output))
				throw Error("Mobile export requires an absent output directory");
			await run(
				expo,
				["export", "--platform", "ios", "--output-dir", output, "--no-minify"],
				cwd,
			);
			const exported = filesAt(output);
			for (const key of [
				"EXPO_PUBLIC_API_URL",
				"EXPO_PUBLIC_WEB_URL",
				"EXPO_PUBLIC_RELAY_URL",
				"EXPO_PUBLIC_REALTIME_URL",
			])
				if (
					!exported.some((file) =>
						readFileSync(file).includes(Buffer.from(inputs[key])),
					)
				)
					throw Error(`Mobile export is missing ${key}`);
			for (const path of exported)
				artifacts.push(await artifactAt(path, repoRoot, path.endsWith(".css")));
		} else if (mode === "simulator" || mode === "device") {
			const device = values.get("--device");
			if (!device)
				throw Error(
					"Pass --device with an explicit simulator or device identifier",
				);
			const configuration =
				values.get("--configuration") ||
				(mode === "device" ? "Release" : "Debug");
			if (!["Release", "Debug"].includes(configuration))
				throw Error("Unsupported iOS configuration");
			await run(
				expo,
				["run:ios", "--device", device, "--configuration", configuration],
				cwd,
			);
		}
		pendingAcceptance.push(
			"mobile-native-and-physical-device",
			"mobile-entitlements-signature-and-widget",
			"mobile-testflight-processing",
		);
	}
	const manifest = {
		schemaVersion: 1,
		kind,
		version,
		sourceRevision,
		sourceDirty: Boolean(dirty),
		targets:
			kind === "cli"
				? requested
				: [kind === "desktop" ? `${platform}-${desktopArch}` : "ios"],
		publicInputs: inputs,
		toolchain: {
			bun: process.versions.bun,
			node: process.versions.node,
			builderPlatform: platform,
			builderArch: arch,
		},
		artifacts,
		pendingAcceptance,
		acceptedForPublication: false,
	};
	const record = join(
		repoRoot,
		".cache/client-packaging",
		`${kind}-${Date.now()}.json`,
	);
	mkdirSync(dirname(record), { recursive: true });
	writeFileSync(record, `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
}

if (import.meta.main) {
	try {
		const result = await runClientPackaging(process.argv.slice(2));
		if (result !== undefined) console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error(
			error instanceof Error ? error.message : "Client packaging failed",
		);
		process.exitCode = 1;
	}
}
