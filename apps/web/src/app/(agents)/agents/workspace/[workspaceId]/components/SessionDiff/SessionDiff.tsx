"use client";

import { FileDiffTool } from "@superset/ui/ai-elements/file-diff-tool";
import { useMemo } from "react";
import type { MockDiffFile } from "../../../../../mock-data";

function calculateTotalStats(files: MockDiffFile[]): {
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

type SessionDiffProps = {
	diffFiles: MockDiffFile[];
};

export function SessionDiff({ diffFiles }: SessionDiffProps) {
	const { totalAdditions, totalDeletions } = useMemo(
		() => calculateTotalStats(diffFiles),
		[diffFiles],
	);

	return (
		<div className="flex h-full flex-col overflow-y-auto px-4 py-4">
			<div className="mb-4 flex items-center gap-2 text-sm">
				<span className="font-medium">
					{diffFiles.length} file{diffFiles.length !== 1 ? "s" : ""} changed
				</span>
				<span className="text-green-500">+{totalAdditions}</span>
				<span className="text-red-500">-{totalDeletions}</span>
			</div>

			<div className="flex flex-col gap-2">
				{diffFiles.map((file) => (
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
