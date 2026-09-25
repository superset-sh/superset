export interface MenuPageSource {
	id: string;
	slug: string;
	title: string;
	visibility: string;
	publishedAt?: Date | string | null;
	updatedAt: Date | string;
}

export interface MenuPage {
	id: string;
	slug: string;
	title: string;
	isPrivate: boolean;
	publishedAtMs: number;
	isNew: boolean;
}

function toMenuPage(page: MenuPageSource, seenAt: number): MenuPage {
	const publishedAtMs = new Date(page.publishedAt ?? page.updatedAt).getTime();
	return {
		id: page.id,
		slug: page.slug,
		title: page.title,
		isPrivate: page.visibility === "just_me",
		publishedAtMs,
		isNew: publishedAtMs > seenAt,
	};
}

export function selectMenuPages({
	workspacePages,
	orgPages,
	favoritePageIds,
	seenAt,
}: {
	workspacePages: readonly MenuPageSource[];
	orgPages: readonly MenuPageSource[];
	favoritePageIds: readonly string[];
	seenAt: number;
}): { workspace: MenuPage[]; pinned: MenuPage[]; hasNew: boolean } {
	const workspace = workspacePages
		.map((page) => toMenuPage(page, seenAt))
		.sort((a, b) => b.publishedAtMs - a.publishedAtMs);

	const inWorkspace = new Set(workspace.map((page) => page.id));
	const orgById = new Map(orgPages.map((page) => [page.id, page]));
	const pinned: MenuPage[] = [];
	for (const id of [...favoritePageIds].reverse()) {
		const page = orgById.get(id);
		if (!page || inWorkspace.has(id)) continue;
		pinned.push({ ...toMenuPage(page, seenAt), isNew: false });
	}

	return { workspace, pinned, hasNew: workspace.some((page) => page.isNew) };
}
