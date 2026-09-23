export function resolveSelectedRepo<Repo extends { folder: string }>(
	repos: readonly Repo[],
	storedFolder: string | undefined,
): Repo | undefined {
	return repos.find((repo) => repo.folder === storedFolder) ?? repos[0];
}
