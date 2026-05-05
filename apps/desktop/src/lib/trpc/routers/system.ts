import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { publicProcedure, router } from "..";

const execFileAsync = promisify(execFile);

const KNOWN_GH_PATHS = [
	"/opt/homebrew/bin/gh",
	"/usr/local/bin/gh",
	"/usr/bin/gh",
	"/bin/gh",
];

interface GhDetectResult {
	installed: boolean;
	version: string | null;
	path: string | null;
}

async function tryGh(path: string): Promise<GhDetectResult | null> {
	try {
		const { stdout } = await execFileAsync(path, ["--version"], {
			timeout: 3000,
		});
		const firstLine = stdout.split("\n")[0]?.trim() ?? "";
		const match = firstLine.match(/gh version (\S+)/);
		const version = match?.[1] ?? null;
		return { installed: true, version, path };
	} catch {
		return null;
	}
}

async function detectGhCli(): Promise<GhDetectResult> {
	for (const path of KNOWN_GH_PATHS) {
		const result = await tryGh(path);
		if (result) return result;
	}
	const result = await tryGh("gh");
	if (result) return result;
	return { installed: false, version: null, path: null };
}

export const createSystemRouter = () => {
	return router({
		detectGhCli: publicProcedure.query(detectGhCli),
	});
};

export type SystemRouter = ReturnType<typeof createSystemRouter>;
