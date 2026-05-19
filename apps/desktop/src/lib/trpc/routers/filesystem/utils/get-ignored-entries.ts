import { spawn } from "node:child_process";
import { getProcessEnvWithShellPath } from "../../workspaces/utils/shell-env";

const GIT_CHECK_IGNORE_TIMEOUT_MS = 5_000;

/**
 * Returns the subset of `names` that `git check-ignore` reports as ignored
 * within `dirAbsolutePath`. Returns an empty set when the directory is not
 * inside a git work tree, when git is unavailable, or on any other failure —
 * callers should treat ignored detection as a best-effort signal.
 *
 * Tracked files are intentionally NOT reported as ignored (we omit
 * `--no-index`), matching git's standard semantics.
 */
export async function getIgnoredEntries(
	dirAbsolutePath: string,
	names: string[],
): Promise<Set<string>> {
	if (names.length === 0) {
		return new Set();
	}

	let env: NodeJS.ProcessEnv;
	try {
		env = await getProcessEnvWithShellPath();
	} catch {
		env = process.env;
	}

	return await new Promise<Set<string>>((resolve) => {
		let stdout = "";
		let settled = false;
		const settle = (value: Set<string>) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			resolve(value);
		};

		// `-z` switches both stdin and stdout to NUL-terminated paths,
		// preserving filenames with leading/trailing spaces or other
		// characters that line-based parsing would mangle.
		const child = spawn(
			"git",
			["-C", dirAbsolutePath, "check-ignore", "-z", "--stdin"],
			{
				env,
				windowsHide: true,
			},
		);

		const timeoutId = setTimeout(() => {
			child.kill();
			settle(new Set());
		}, GIT_CHECK_IGNORE_TIMEOUT_MS);

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});

		child.stdout.on("error", () => {
			settle(new Set());
		});

		child.stdin.on("error", () => {
			// git exits early when not in a repo; ignore EPIPE so the close
			// handler can resolve based on exit code.
		});

		child.on("error", () => {
			settle(new Set());
		});

		child.on("close", (code) => {
			// Exit codes per `git check-ignore`:
			//   0  — at least one path matched
			//   1  — no paths matched
			//  128 — fatal (e.g. not a git repository)
			if (code === 0) {
				const matched = stdout.split("\0").filter(Boolean);
				settle(new Set(matched));
				return;
			}
			settle(new Set());
		});

		for (const name of names) {
			if (!child.stdin.writable) break;
			child.stdin.write(`${name}\0`);
		}
		child.stdin.end();
	});
}
