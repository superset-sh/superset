"use client";

import { FileDiffTool } from "@superset/ui/ai-elements/file-diff-tool";
import { useMemo } from "react";
import { mockDiffFiles } from "../../../mock-data";

function calculateTotalStats(files: typeof mockDiffFiles): {
	totalAdditions: number;
	totalDeletions: number;
} {
	let totalAdditions = 0;
	let totalDeletions = 0;
	for (const file of files) {
		const newLines = file.newString.split("\n").length;
		const oldLines = file.oldString ? file.oldString.split("\n").length : 0;
		totalAdditions += newLines;
		totalDeletions += oldLines;
	}
	return { totalAdditions, totalDeletions };
}

export function SessionDiff() {
	const { totalAdditions, totalDeletions } = useMemo(
		() => calculateTotalStats(mockDiffFiles),
		[],
	);

	return (
		<div className="flex h-full flex-col overflow-y-auto px-4 py-4">
			<div className="mb-4 flex items-center gap-2 text-sm">
				<span className="font-medium">
					{mockDiffFiles.length} file{mockDiffFiles.length !== 1 ? "s" : ""}{" "}
					changed
				</span>
				<span className="text-green-500">+{totalAdditions}</span>
				<span className="text-red-500">-{totalDeletions}</span>
			</div>

			<div className="flex flex-col gap-2">
				{mockDiffFiles.map((file) => (
					<FileDiffTool
						key={file.filePath}
						filePath={file.filePath}
						oldString={file.oldString}
						newString={file.newString}
						state="output-available"
						className="rounded-lg border border-border"
					/>
				))}
			</div>
		</div>
	);
}
