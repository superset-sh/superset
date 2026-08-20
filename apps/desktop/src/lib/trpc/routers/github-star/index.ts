import { publicProcedure, router } from "../..";
import { execWithShellEnv } from "../workspaces/utils/shell-env";

export type GithubStarState = "starred" | "not_starred" | "unknown";

const STARRED_REPO_PATH = "user/starred/superset-sh/superset";
// A hung `gh` process must not leave the query/mutation pending forever —
// both callers already treat any failure as a safe "unknown"/false outcome.
// This only bounds the `gh` call itself: execWithShellEnv resolves the shell
// environment first, which has its own ~8s timeout (shell-env.ts) on a cache
// miss — worst case end-to-end is closer to 18s, not 10s.
const GH_CALL_TIMEOUT_MS = 10_000;

/**
 * Checks whether the signed-in `gh` CLI user has starred superset-sh/superset.
 * GitHub returns 204 for "starred", 404 for "not starred". Every other
 * outcome (gh missing/unauthenticated, network error, rate limit) collapses
 * to "unknown" so callers always have a safe fallback value instead of an
 * error to handle — renderer surfaces treat "unknown" as "not actionable"
 * and hide/disable their star button rather than offering a distinct CTA.
 */
export async function checkGithubStarred(): Promise<GithubStarState> {
	try {
		const { stdout, stderr } = await execWithShellEnv(
			"gh",
			["api", "--include", STARRED_REPO_PATH],
			{ timeout: GH_CALL_TIMEOUT_MS },
		);
		const response = `${stdout ?? ""}\n${stderr ?? ""}`;
		if (/HTTP\/\S+\s+(?:200|204)\b/.test(response)) {
			return "starred";
		}
		return "unknown";
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("HTTP 404")) {
			return "not_starred";
		}
		return "unknown";
	}
}

/** Stars superset-sh/superset on behalf of the signed-in `gh` CLI user. Never throws. */
export async function starGithubRepo(): Promise<boolean> {
	try {
		await execWithShellEnv("gh", ["api", "-X", "PUT", STARRED_REPO_PATH], {
			timeout: GH_CALL_TIMEOUT_MS,
		});
		return true;
	} catch {
		return false;
	}
}

export const createGithubStarRouter = () => {
	return router({
		checkStarred: publicProcedure.query(() => checkGithubStarred()),
		star: publicProcedure.mutation(() => starGithubRepo()),
	});
};

export type GithubStarRouter = ReturnType<typeof createGithubStarRouter>;
