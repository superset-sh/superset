import type { ApiClient } from "../../../../../lib/api-client";

export interface WorkspaceLink {
	workspaceId: string;
	entryPath: string;
}

/**
 * The page assets stage against. Publishing a single file needs no page up
 * front — `publish` mints one — but assets have to attach to something that
 * already exists, so a directory publish resolves the page it is republishing
 * or creates an empty one to publish into.
 */
export async function resolvePageId({
	api,
	explicitPageId,
	link,
	title,
}: {
	api: ApiClient;
	explicitPageId: string | undefined;
	link: WorkspaceLink | undefined;
	title: string | undefined;
}): Promise<string> {
	if (explicitPageId) return explicitPageId;

	if (link) {
		// Best effort: a lookup failure just means this publish creates a page,
		// and the entry-path conflict below reports it properly if one exists.
		const resolved = await api.page.resolveByEntryPath
			.query(link)
			.catch(() => null);
		if (resolved) return resolved.id;
	}

	const created = await api.page.create.mutate({
		...(link ?? {}),
		...(title ? { title } : {}),
	});
	return created.id;
}
