import { execFile } from "node:child_process";
import { getStrictShellEnvironment } from "../../terminal/clean-shell-env";

const GH_STATUS_TIMEOUT_MS = 10_000;

export type GhCliStatus = "authenticated" | "unauthenticated" | "not_installed";

/**
 * Whether this machine could authenticate a git operation against GitHub.
 * A property of the host, not of any one repository — the clone preflight
 * and the host's own settings page both read it.
 */
export async function probeGhCli(): Promise<GhCliStatus> {
	const env = await getStrictShellEnvironment().catch(
		() => process.env as Record<string, string>,
	);
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
