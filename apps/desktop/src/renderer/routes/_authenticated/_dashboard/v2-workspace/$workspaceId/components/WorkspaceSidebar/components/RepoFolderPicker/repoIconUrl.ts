import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";

/**
 * The avatar for one checkout of a workspace. `repository` is `owner/name`
 * when the checkout has a parsed GitHub remote, and the folder name when it
 * has none — which owns no avatar, so the picker falls back to a letter tile.
 */
export function repoIconUrl(repository: string | null): string | null {
	const owner = repository?.includes("/") ? repository.split("/")[0] : null;
	return resolveProjectIconUrl({ icon: null, repoOwner: owner ?? null });
}
