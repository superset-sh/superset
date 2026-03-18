import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useResolvedTheme } from "renderer/stores/theme";
import { getEditorTheme } from "shared/themes";
import { withAlpha } from "shared/themes/utils";

interface DiffRegion {
	type: "addition" | "deletion" | "modification";
	/** Proportional start position (0–1) */
	start: number;
	/** Proportional height (0–1) */
	height: number;
}

interface DiffScrollbarDecorationsProps {
	scrollContainerRef: RefObject<HTMLDivElement | null>;
}

interface MeasuredRegion {
	type: DiffRegion["type"];
	top: number;
	bottom: number;
}

function measureDiffRegions(container: HTMLDivElement): DiffRegion[] {
	const lineElements = Array.from(
		container.querySelectorAll<HTMLElement>(
			"[data-line-type='change-addition'], [data-line-type='change-deletion']",
		),
	);

	if (lineElements.length === 0 || container.scrollHeight === 0) {
		return [];
	}

	const containerRect = container.getBoundingClientRect();
	const linesByIndex = new Map<
		string,
		{
			top: number;
			bottom: number;
			hasAddition: boolean;
			hasDeletion: boolean;
		}
	>();

	for (const element of lineElements) {
		const lineIndex = element.dataset.lineIndex;
		if (!lineIndex) {
			continue;
		}

		const rect = element.getBoundingClientRect();
		const top = rect.top - containerRect.top + container.scrollTop;
		const bottom = rect.bottom - containerRect.top + container.scrollTop;
		const existing = linesByIndex.get(lineIndex);

		if (existing) {
			existing.top = Math.min(existing.top, top);
			existing.bottom = Math.max(existing.bottom, bottom);
			existing.hasAddition ||= element.dataset.lineType === "change-addition";
			existing.hasDeletion ||= element.dataset.lineType === "change-deletion";
			continue;
		}

		linesByIndex.set(lineIndex, {
			top,
			bottom,
			hasAddition: element.dataset.lineType === "change-addition",
			hasDeletion: element.dataset.lineType === "change-deletion",
		});
	}

	const measuredRegions = Array.from(linesByIndex.values())
		.map<MeasuredRegion>((line) => ({
			type:
				line.hasAddition && line.hasDeletion
					? "modification"
					: line.hasAddition
						? "addition"
						: "deletion",
			top: line.top,
			bottom: line.bottom,
		}))
		.sort((a, b) => a.top - b.top);

	if (measuredRegions.length === 0) {
		return [];
	}

	const mergedRegions: MeasuredRegion[] = [];
	for (const region of measuredRegions) {
		const previous = mergedRegions.at(-1);
		if (!previous) {
			mergedRegions.push(region);
			continue;
		}

		if (previous.type === region.type && region.top <= previous.bottom + 1) {
			previous.bottom = Math.max(previous.bottom, region.bottom);
			continue;
		}

		mergedRegions.push(region);
	}

	return mergedRegions.map((region) => ({
		type: region.type,
		start: region.top / container.scrollHeight,
		height: (region.bottom - region.top) / container.scrollHeight,
	}));
}

export function DiffScrollbarDecorations({
	scrollContainerRef,
}: DiffScrollbarDecorationsProps) {
	const activeTheme = useResolvedTheme();
	const [viewportRatio, setViewportRatio] = useState<{
		top: number;
		height: number;
	} | null>(null);
	const [regions, setRegions] = useState<DiffRegion[]>([]);

	const editorTheme = useMemo(() => getEditorTheme(activeTheme), [activeTheme]);
	const additionDecorationColor = useMemo(
		() => withAlpha(editorTheme.colors.addition, 0.6),
		[editorTheme],
	);
	const deletionDecorationColor = useMemo(
		() => withAlpha(editorTheme.colors.deletion, 0.6),
		[editorTheme],
	);
	const modificationDecorationColor = useMemo(
		() => withAlpha(editorTheme.colors.modified, 0.55),
		[editorTheme],
	);

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

	const updateRegions = useCallback(() => {
		const container = scrollContainerRef.current;
		if (!container) {
			setRegions([]);
			return;
		}

		setRegions(measureDiffRegions(container));
	}, [scrollContainerRef]);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		let frameId = 0;
		const scheduleUpdate = () => {
			cancelAnimationFrame(frameId);
			frameId = requestAnimationFrame(() => {
				updateViewport();
				updateRegions();
			});
		};

		scheduleUpdate();
		container.addEventListener("scroll", updateViewport, { passive: true });

		const resizeObserver = new ResizeObserver(scheduleUpdate);
		resizeObserver.observe(container);
		const mutationObserver = new MutationObserver(scheduleUpdate);
		mutationObserver.observe(container, {
			childList: true,
			subtree: true,
		});

		return () => {
			cancelAnimationFrame(frameId);
			container.removeEventListener("scroll", updateViewport);
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	}, [scrollContainerRef, updateRegions, updateViewport]);

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
					className="absolute right-0.5 w-1 rounded-full"
					style={{
						backgroundColor:
							region.type === "addition"
								? additionDecorationColor
								: region.type === "deletion"
									? deletionDecorationColor
									: modificationDecorationColor,
						top: `${region.start * 100}%`,
						height: `max(2px, ${region.height * 100}%)`,
					}}
				/>
			))}
		</div>
	);
}
