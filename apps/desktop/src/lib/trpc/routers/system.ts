import { publicProcedure, router } from "..";
import { execWithShellEnv } from "./workspaces/utils/shell-env";

interface GhDetectResult {
	installed: boolean;
	authenticated: boolean;
	version: string | null;
	path: string | null;
}

async function ghSucceeds(args: string[]): Promise<boolean> {
	try {
		await execWithShellEnv("gh", args, { timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

async function detectGhCli(): Promise<GhDetectResult> {
	// Resolve `gh` via the user's login-shell PATH (execWithShellEnv retries with
	// the derived shell env on ENOENT), so we find it wherever it's installed —
	// homebrew, MacPorts, nix, asdf, etc. — not just a hardcoded path list.
	let version: string | null = null;
	try {
		const { stdout } = await execWithShellEnv("gh", ["--version"], {
			timeout: 5000,
		});
		const firstLine = stdout.split("\n")[0]?.trim() ?? "";
		version = firstLine.match(/gh version (\S+)/)?.[1] ?? null;
	} catch {
		return {
			installed: false,
			authenticated: false,
			version: null,
			path: null,
		};
	}

	const authenticated =
		(await ghSucceeds([
			"auth",
			"status",
			"--active",
			"--hostname",
			"github.com",
		])) || (await ghSucceeds(["auth", "status", "--hostname", "github.com"]));

	return { installed: true, authenticated, version, path: "gh" };
}

export const createSystemRouter = () => {
	return router({
		detectGhCli: publicProcedure.query(detectGhCli),
	});
};

export type SystemRouter = ReturnType<typeof createSystemRouter>;
