export interface RepoRun {
	path: string;
	commands: readonly string[];
	cwd?: string;
	isPrimary: boolean;
}

export interface ComposedRepoRun {
	commands: string[];
	cwd?: string;
}

function quote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function enter(repo: RepoRun): string[] {
	return repo.cwd
		? [`cd ${quote(repo.path)}`, `cd ${quote(repo.cwd)}`]
		: [`cd ${quote(repo.path)}`];
}

/**
 * The Run button's command for a project over several source folders: every
 * folder that defines one, each from its own checkout, started together and
 * waited on — a folder's run is usually a server, so chaining them would
 * leave all but the first unstarted.
 *
 * One folder resolves to what a single-repo workspace has always run: the
 * commands alone, the terminal's own cwd being the checkout.
 */
export function composeRepoRunCommands(
	repos: readonly RepoRun[],
): ComposedRepoRun | null {
	const runnable = repos.filter((repo) => repo.commands.length > 0);
	if (runnable.length === 0) return null;

	const only = runnable[0];
	if (runnable.length === 1 && only) {
		return only.isPrimary
			? { commands: [...only.commands], ...(only.cwd && { cwd: only.cwd }) }
			: { commands: [[...enter(only), ...only.commands].join(" && ")] };
	}

	const jobs = runnable.map((repo) =>
		[...enter(repo), ...repo.commands].join(" && "),
	);
	return { commands: [`${jobs.join(" & ")} & wait`] };
}
