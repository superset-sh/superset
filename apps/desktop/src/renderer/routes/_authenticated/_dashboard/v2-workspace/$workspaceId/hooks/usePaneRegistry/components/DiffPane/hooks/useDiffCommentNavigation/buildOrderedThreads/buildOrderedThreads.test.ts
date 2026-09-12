import { describe, expect, it } from "bun:test";
import type { CodeViewItem } from "@pierre/diffs";
import type { DiffAnnotationMetadata } from "../../useDiffAnnotations";
import { buildOrderedThreads } from "./buildOrderedThreads";

function thread(threadId: string): DiffAnnotationMetadata {
	return {
		kind: "thread",
		threadId,
		comments: [],
		isResolved: false,
		isOutdated: false,
	};
}

function diffItem(
	id: string,
	annotations: Array<{
		lineNumber: number;
		side?: "additions" | "deletions";
		metadata: DiffAnnotationMetadata;
	}>,
): CodeViewItem<DiffAnnotationMetadata> {
	return {
		id,
		type: "diff",
		fileDiff: {} as never,
		annotations: annotations as never,
	} as CodeViewItem<DiffAnnotationMetadata>;
}

describe("buildOrderedThreads", () => {
	it("walks items in diff order and sorts by line within an item", () => {
		const result = buildOrderedThreads([
			diffItem("diff:unstaged:b.ts", [
				{ lineNumber: 30, side: "additions", metadata: thread("t2") },
				{ lineNumber: 4, side: "deletions", metadata: thread("t1") },
			]),
			diffItem("diff:unstaged:a.ts", [
				{ lineNumber: 1, side: "additions", metadata: thread("t3") },
			]),
		]);
		expect(result.map((t) => t.threadId)).toEqual(["t1", "t2", "t3"]);
		expect(result[0]).toEqual({
			threadId: "t1",
			itemId: "diff:unstaged:b.ts",
			itemType: "diff",
			lineNumber: 4,
			side: "deletions",
		});
	});

	it("dedupes a thread that appears on duplicate-path items (staged + unstaged)", () => {
		const result = buildOrderedThreads([
			diffItem("diff:unstaged:a.ts", [
				{ lineNumber: 7, side: "additions", metadata: thread("t1") },
			]),
			diffItem("diff:staged:a.ts", [
				{ lineNumber: 7, side: "additions", metadata: thread("t1") },
			]),
		]);
		expect(result).toHaveLength(1);
		expect(result[0]?.itemId).toBe("diff:unstaged:a.ts");
	});

	it("skips composer and binary-placeholder annotations", () => {
		const result = buildOrderedThreads([
			diffItem("diff:unstaged:a.ts", [
				{
					lineNumber: 2,
					side: "additions",
					metadata: {
						kind: "composer",
						itemId: "diff:unstaged:a.ts",
						startLine: 1,
						endLine: 2,
						startSide: "additions",
						endSide: "additions",
					},
				},
				{ lineNumber: 5, side: "additions", metadata: thread("t1") },
			]),
			{
				id: "diff:unstaged:img.png",
				type: "file",
				file: { name: "img.png", contents: " " },
				annotations: [
					{ lineNumber: 1, metadata: { kind: "binary-placeholder" } },
					{ lineNumber: 1, metadata: thread("t2") },
				],
			} as unknown as CodeViewItem<DiffAnnotationMetadata>,
		]);
		expect(result.map((t) => t.threadId)).toEqual(["t1", "t2"]);
		// The binary placeholder is a `file` item: no side, item-scroll target.
		expect(result[1]).toEqual({
			threadId: "t2",
			itemId: "diff:unstaged:img.png",
			itemType: "file",
			lineNumber: 1,
		});
	});

	it("returns an empty list when no items carry annotations", () => {
		expect(buildOrderedThreads([diffItem("diff:unstaged:a.ts", [])])).toEqual(
			[],
		);
	});
});
