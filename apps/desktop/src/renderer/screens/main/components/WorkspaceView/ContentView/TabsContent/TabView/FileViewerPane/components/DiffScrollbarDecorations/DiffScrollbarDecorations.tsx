import { parseDiffFromFile } from "@pierre/diffs";
import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { FileContents } from "shared/changes-types";

interface DiffRegion {
	type: "addition" | "deletion";
	/** Proportional start position (0–1) */
	start: number;
	/** Proportional height (0–1) */
	height: number;
}

interface DiffScrollbarDecorationsProps {
	contents: FileContents;
	scrollContainerRef: RefObject<HTMLDivElement | null>;
}

function computeDiffRegions(contents: FileContents): DiffRegion[] {
	const diff = parseDiffFromFile(
		{ name: "before", contents: contents.original },
		{ name: "after", contents: contents.modified },
	);

	const totalLines = diff.unifiedLineCount;
	if (totalLines === 0) return [];

	const regions: DiffRegion[] = [];
	let unifiedLine = 0;

	for (const hunk of diff.hunks) {
		// Context lines before this hunk
		unifiedLine += hunk.collapsedBefore;

		for (const content of hunk.hunkContent) {
			if (content.type === "context") {
				unifiedLine += content.lines.length;
			} else {
				if (content.deletions.length > 0) {
					regions.push({
						type: "deletion",
						start: unifiedLine / totalLines,
						height: Math.max(content.deletions.length / totalLines, 0.003),
					});
					unifiedLine += content.deletions.length;
				}
				if (content.additions.length > 0) {
					regions.push({
						type: "addition",
						start: unifiedLine / totalLines,
						height: Math.max(content.additions.length / totalLines, 0.003),
					});
					unifiedLine += content.additions.length;
				}
			}
		}
	}

	return regions;
}

export function DiffScrollbarDecorations({
	contents,
	scrollContainerRef,
}: DiffScrollbarDecorationsProps) {
	const [viewportRatio, setViewportRatio] = useState<{
		top: number;
		height: number;
	} | null>(null);

	const regions = useMemo(() => computeDiffRegions(contents), [contents]);

	const updateViewport = useCallback(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const { scrollTop, scrollHeight, clientHeight } = container;
		if (scrollHeight <= clientHeight) {
			setViewportRatio(null);
			return;
		}

		setViewportRatio({
			top: scrollTop / scrollHeight,
			height: clientHeight / scrollHeight,
		});
	}, [scrollContainerRef]);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		updateViewport();
		container.addEventListener("scroll", updateViewport, { passive: true });

		const resizeObserver = new ResizeObserver(updateViewport);
		resizeObserver.observe(container);

		return () => {
			container.removeEventListener("scroll", updateViewport);
			resizeObserver.disconnect();
		};
	}, [scrollContainerRef, updateViewport]);

	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const container = scrollContainerRef.current;
			if (!container) return;

			const rect = e.currentTarget.getBoundingClientRect();
			const ratio = (e.clientY - rect.top) / rect.height;
			const targetScroll =
				ratio * container.scrollHeight - container.clientHeight / 2;
			container.scrollTo({ top: targetScroll, behavior: "smooth" });
		},
		[scrollContainerRef],
	);

	if (regions.length === 0) return null;

	return (
		// biome-ignore lint/a11y/useSemanticElements: scrollbar decoration overlay, not a semantic element
		<div
			role="toolbar"
			tabIndex={-1}
			className="absolute top-0 right-0 bottom-0 w-2 cursor-pointer"
			onClick={handleClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					handleClick(e as unknown as React.MouseEvent<HTMLDivElement>);
				}
			}}
		>
			{/* Viewport indicator */}
			{viewportRatio && (
				<div
					className="absolute right-0 w-full bg-foreground/8 rounded-sm"
					style={{
						top: `${viewportRatio.top * 100}%`,
						height: `${viewportRatio.height * 100}%`,
					}}
				/>
			)}
			{/* Diff regions */}
			{regions.map((region, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: static diff regions derived from content
					key={index}
					className={`absolute right-0.5 w-1 rounded-full ${
						region.type === "addition" ? "bg-green-500/80" : "bg-red-500/80"
					}`}
					style={{
						top: `${region.start * 100}%`,
						height: `max(2px, ${region.height * 100}%)`,
					}}
				/>
			))}
		</div>
	);
}
