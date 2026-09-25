/**
 * Every File carried by a clipboard or drag payload, in order.
 *
 * Reads both lists a `DataTransfer` exposes and merges them. Measured against
 * a real macOS pasteboard, the two agree on every payload shape we could
 * produce (Finder copies of one or many files, mixed file types, screenshots,
 * images alongside text or HTML), so `files` alone is what actually carries a
 * paste today; `items` stays in as a fallback for any payload that surfaces a
 * file only through `getAsFile()`.
 *
 * De-duplicate on name, size and type, and on nothing else. Chromium
 * synthesizes a separate File object per accessor and stamps each one's
 * `lastModified` with `Date.now()` as it is created, so the two lists disagree
 * about the same pasted screenshot whenever the millisecond ticks between the
 * calls. Folding that field into the key attaches the image twice, on roughly
 * one paste in eight (measured over CDP against a real pasteboard) — an
 * intermittent duplicate is worse to chase than a consistent one.
 */
export function getClipboardFiles(
	data: DataTransfer | null | undefined,
): File[] {
	if (!data) return [];

	const files = Array.from(data.files ?? []);
	const seen = new Set(files.map(fileKey));

	for (const item of Array.from(data.items ?? [])) {
		if (item.kind !== "file") continue;
		const file = item.getAsFile();
		if (!file) continue;
		const key = fileKey(file);
		if (seen.has(key)) continue;
		seen.add(key);
		files.push(file);
	}

	return files;
}

function fileKey(file: File): string {
	return `${file.name}:${file.size}:${file.type}`;
}
