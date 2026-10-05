/**
 * The one place the publish result is shaped, for humans and agents alike.
 * The contract mirrors an artifact publish — what was published, where it
 * lives, and whether this session watches it — with notes in a fixed order
 * so single-file and directory publishes read the same, and `assets`,
 * `unanchored` and `watching` always present in the JSON — `--json` prints
 * only `data`, so anything a caller has to act on lives there too.
 */
export function publishResult({
	page,
	path,
	assets,
	externalPath,
	unanchored,
	watching,
	watchNote,
}: {
	page: { id: string; title: string; version: number; url: string } & Record<
		string,
		unknown
	>;
	path: string;
	assets: {
		uploaded: number;
		reused: number;
		warnings: string[];
	};
	externalPath: string | null;
	unanchored: boolean;
	watching: boolean;
	watchNote: string | null;
}): { data: Record<string, unknown>; message: string } {
	const republish = `superset pages publish ${
		/\s/.test(path) ? JSON.stringify(path) : path
	} --page ${page.id}`;
	const lines = [`Published "${page.title}" v${page.version}`, page.url];
	const count = assets.uploaded + assets.reused;
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
	if (unanchored) {
		lines.push(
			"No workspace, so the next publish of this file would create a second page",
			`To add a version instead: ${republish}`,
		);
	}
	if (watchNote) lines.push(watchNote);

	return {
		data: {
			...page,
			unanchored,
			...(unanchored ? { republish } : {}),
			watching,
			...(watchNote ? { watchNote } : {}),
			assets: { uploaded: assets.uploaded, reused: assets.reused },
		},
		message: lines.join("\n"),
	};
}
