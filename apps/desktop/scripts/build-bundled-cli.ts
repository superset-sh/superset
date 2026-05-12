import { spawn } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";

type SupportedPlatform = "darwin" | "linux" | "win32";
type SupportedArch = "arm64" | "x64";

const TARGET_PLATFORM = (process.env.TARGET_PLATFORM ??
	process.platform) as NodeJS.Platform;
const TARGET_ARCH = (process.env.TARGET_ARCH ?? process.arch) as string;

const BUN_TARGETS: Partial<
	Record<SupportedPlatform, Partial<Record<SupportedArch, string>>>
> = {
	darwin: {
		arm64: "bun-darwin-arm64",
		x64: "bun-darwin-x64",
	},
	linux: {
		arm64: "bun-linux-arm64",
		x64: "bun-linux-x64",
	},
	win32: {
		x64: "bun-windows-x64",
	},
};

function getBunTarget(): string {
	const platformTargets = BUN_TARGETS[TARGET_PLATFORM as SupportedPlatform];
	const target = platformTargets?.[TARGET_ARCH as SupportedArch];
	if (!target) {
		throw new Error(
			`Unsupported bundled CLI target: ${TARGET_PLATFORM}/${TARGET_ARCH}`,
		);
	}
	return target;
}

function run(
	command: string,
	args: string[],
	options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env,
			stdio: "inherit",
		});

		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolvePromise();
				return;
			}
			reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
		});
	});
}

function buildCliBuildEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	const apiUrl =
		process.env.SUPERSET_API_URL || process.env.NEXT_PUBLIC_API_URL;
	const webUrl =
		process.env.SUPERSET_WEB_URL || process.env.NEXT_PUBLIC_WEB_URL;

	if (apiUrl) {
		env.SUPERSET_API_URL = apiUrl;
	}
	if (webUrl) {
		env.SUPERSET_WEB_URL = webUrl;
	}

	return env;
}

const desktopDir = resolve(import.meta.dirname, "..");
const repoRoot = resolve(desktopDir, "../..");
config({ path: resolve(repoRoot, ".env"), override: false, quiet: true });

const cliDir = resolve(repoRoot, "packages/cli");
const outfile = resolve(
	desktopDir,
	"dist/resources/bin",
	TARGET_PLATFORM === "win32" ? "superset.exe" : "superset",
);

mkdirSync(dirname(outfile), { recursive: true });

await run(
	"bun",
	["run", "build", `--target=${getBunTarget()}`, `--outfile=${outfile}`],
	{
		cwd: cliDir,
		env: buildCliBuildEnv(),
	},
);

if (TARGET_PLATFORM !== "win32") {
	chmodSync(outfile, 0o755);
}

console.log(`[desktop] bundled CLI written to ${outfile}`);
