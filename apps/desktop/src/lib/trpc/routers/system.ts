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
	authenticated: boolean;
	version: string | null;
	path: string | null;
}

interface GhInstallResult {
	version: string | null;
	path: string;
}

async function tryGh(path: string): Promise<GhInstallResult | null> {
	try {
		const { stdout } = await execFileAsync(path, ["--version"], {
			timeout: 3000,
		});
		const firstLine = stdout.split("\n")[0]?.trim() ?? "";
		const match = firstLine.match(/gh version (\S+)/);
		const version = match?.[1] ?? null;
		return { version, path };
	} catch {
		return null;
	}
}

async function checkGhAuth(path: string): Promise<boolean> {
	try {
		await execFileAsync(path, ["auth", "status"], { timeout: 3000 });
		return true;
	} catch {
		return false;
	}
}

async function detectGhCli(): Promise<GhDetectResult> {
	let install: GhInstallResult | null = null;
	for (const path of KNOWN_GH_PATHS) {
		install = await tryGh(path);
		if (install) break;
	}
	if (!install) {
		install = await tryGh("gh");
	}
	if (!install) {
		return {
			installed: false,
			authenticated: false,
			version: null,
			path: null,
		};
	}
	const authenticated = await checkGhAuth(install.path);
	return {
		installed: true,
		authenticated,
		version: install.version,
		path: install.path,
	};
}

export const createSystemRouter = () => {
	return router({
		detectGhCli: publicProcedure.query(detectGhCli),
	});
};

export type SystemRouter = ReturnType<typeof createSystemRouter>;
