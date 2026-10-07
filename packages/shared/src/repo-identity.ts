import type { ParsedRemote } from "./git-remote";

export type RepositoryIdentity = Pick<
	ParsedRemote,
	"provider" | "host" | "owner" | "name"
>;

export function repositoryIdentityKey(repo: RepositoryIdentity): string {
	const canonical = (value: string) =>
		repo.provider === "github" ? value.toLowerCase() : value;
	return JSON.stringify([
		repo.provider,
		repo.host.toLowerCase(),
		canonical(repo.owner),
		canonical(repo.name),
	]);
}
