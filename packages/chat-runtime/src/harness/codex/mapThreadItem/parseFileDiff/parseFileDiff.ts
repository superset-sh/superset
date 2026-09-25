export type ParsedFileDiff = { oldText: string | null; newText: string };

export function parseFileDiff(kind: string, diff: string): ParsedFileDiff {
	if (kind === "add") return { oldText: null, newText: diff };
	if (kind === "delete") return { oldText: diff, newText: "" };
	if (!diff.includes("@@")) return { oldText: null, newText: diff };

	const oldLines: string[] = [];
	const newLines: string[] = [];
	for (const line of diff.split("\n")) {
		if (line.startsWith("@@") || line.startsWith("\\")) continue;
		if (line.startsWith("-")) {
			oldLines.push(line.slice(1));
			continue;
		}
		if (line.startsWith("+")) {
			newLines.push(line.slice(1));
			continue;
		}
		const context = line.startsWith(" ") ? line.slice(1) : line;
		oldLines.push(context);
		newLines.push(context);
	}
	return { oldText: oldLines.join("\n"), newText: newLines.join("\n") };
}
