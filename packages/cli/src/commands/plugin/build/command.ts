import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { loadLocalManifest } from "../lib";

const ENTRY_CANDIDATES = ["src/app.tsx", "src/app.ts", "src/app.jsx"];

const REACT_SHIM =
	"module.exports = globalThis.__SUPERSET_PLUGIN_HOST__.React;\n";
const JSX_RUNTIME_SHIM =
	"module.exports = globalThis.__SUPERSET_PLUGIN_HOST__.ReactJsxRuntime;\n";

const execFileAsync = promisify(execFile);

async function hasCommand(name: string): Promise<boolean> {
	try {
		await execFileAsync(name, ["--version"]);
		return true;
	} catch {
		return false;
	}
}

async function resolveEsbuildInvocation(dir: string): Promise<string[]> {
	const local = path.join(dir, "node_modules", ".bin", "esbuild");
	if (existsSync(local)) return [local];
	if (await hasCommand("bunx")) return ["bunx", "esbuild"];
	return ["npx", "--yes", "esbuild"];
}

export default command({
	description: "Bundle a plugin's UI to the manifest's app entry",
	args: [positional("dir").desc("Plugin directory (default: current)")],
	options: {
		entry: string().desc("UI entry file (default: src/app.tsx)"),
	},
	skipMiddleware: true,
	run: async ({ args, options }) => {
		const dir = path.resolve((args.dir as string | undefined) ?? ".");
		const { manifest } = await loadLocalManifest(dir);
		if (!manifest.app) {
			return {
				data: { built: false },
				message: 'Manifest has no "app" entry; nothing to build.',
			};
		}

		const entry = options.entry
			? path.resolve(dir, options.entry)
			: ENTRY_CANDIDATES.map((candidate) => path.join(dir, candidate)).find(
					(candidate) => existsSync(candidate),
				);
		if (!entry || !existsSync(entry)) {
			throw new CLIError(
				options.entry
					? `Entry not found: ${options.entry}`
					: `No UI entry found (looked for ${ENTRY_CANDIDATES.join(", ")})`,
				"Pass --entry <file> to point at your UI entry",
			);
		}

		const outfile = path.join(dir, manifest.app);
		await mkdir(path.dirname(outfile), { recursive: true });

		// The desktop app injects React on the plugin host global; aliasing
		// keeps a second React copy out of the bundle so hooks work.
		const shimDir = await mkdtemp(path.join(os.tmpdir(), "superset-plugin-"));
		try {
			const reactShim = path.join(shimDir, "react-shim.cjs");
			const jsxRuntimeShim = path.join(shimDir, "jsx-runtime-shim.cjs");
			await writeFile(reactShim, REACT_SHIM);
			await writeFile(jsxRuntimeShim, JSX_RUNTIME_SHIM);

			const [bin, ...prefix] = await resolveEsbuildInvocation(dir);
			const buildArgs = [
				...prefix,
				entry,
				"--bundle",
				"--format=esm",
				"--jsx=automatic",
				`--outfile=${outfile}`,
				`--alias:react=${reactShim}`,
				`--alias:react/jsx-runtime=${jsxRuntimeShim}`,
			];
			try {
				await execFileAsync(bin as string, buildArgs, { cwd: dir });
			} catch (error) {
				const stderr =
					typeof (error as { stderr?: unknown }).stderr === "string"
						? ((error as { stderr: string }).stderr ?? "").trim()
						: "";
				throw new CLIError(
					stderr
						? `esbuild failed:\n${stderr}`
						: `Failed to run esbuild: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		} finally {
			await rm(shimDir, { recursive: true, force: true });
		}

		const { size } = await stat(outfile);
		return {
			data: { built: true, outfile, bytes: size },
			message: `Built ${path.relative(dir, outfile)} (${(size / 1024).toFixed(1)} KB)`,
		};
	},
});
