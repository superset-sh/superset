import { execFile } from "node:child_process";
import { getToolEnvironment } from "../../terminal/clean-shell-env";

const GH_STATUS_TIMEOUT_MS = 10_000;

export type GhCliStatus = "authenticated" | "unauthenticated" | "not_installed";

/**
 * Whether this machine could authenticate a git operation against GitHub.
 * A property of the host, not of any one repository, so the host's settings
 * page can answer it before a clone is in play.
 */
export async function probeGhCli(): Promise<GhCliStatus> {
	// getToolEnvironment, not process.env: a GUI-launched host inherits
	// launchd's PATH, which has no Homebrew, and `gh` would read as missing
	// on a machine that has it installed.
	const env = await getToolEnvironment();
	return new Promise((resolve) => {
		execFile(
			"gh",
			["auth", "status", "--hostname", "github.com"],
			{ timeout: GH_STATUS_TIMEOUT_MS, env, encoding: "utf8" },
			(error) => {
				if (!error) {
					resolve("authenticated");
					return;
				}
				resolve(
					(error as NodeJS.ErrnoException).code === "ENOENT"
						? "not_installed"
						: "unauthenticated",
				);
			},
		);
	});
}
