/**
 * The one place the publish result is shaped, for humans and agents alike.
 * The contract mirrors an artifact publish — what was published, where it
 * lives, and whether this session watches it — with notes in a fixed order
 * so single-file and directory publishes read the same, and `assets` and
 * `watching` always present in the JSON.
 */
export function publishResult({
	page,
	assets,
	externalPath,
	watching,
	watchNote,
}: {
	page: { title: string; version: number; url: string } & Record<
		string,
		unknown
	>;
	assets: {
		published: { path: string; fileId: string }[];
		reused: number;
		warnings: string[];
	};
	externalPath: string | null;
	watching: boolean;
	watchNote: string | null;
}): { data: Record<string, unknown>; message: string } {
	const lines = [`Published "${page.title}" v${page.version}`, page.url];
	const count = assets.published.length;
	if (count > 0) {
		lines.push(
			`${count} asset${count === 1 ? "" : "s"}${
				assets.reused > 0
					? ` (${assets.reused} unchanged, not re-uploaded)`
					: ""
			}`,
		);
	}
	lines.push(...assets.warnings);
	if (externalPath) {
		lines.push(
			`Outside the workspace, so this page is keyed as "${externalPath}"`,
		);
	}
	if (watchNote) lines.push(watchNote);

	return {
		data: { ...page, watching, assets: assets.published },
		message: lines.join("\n"),
	};
}
