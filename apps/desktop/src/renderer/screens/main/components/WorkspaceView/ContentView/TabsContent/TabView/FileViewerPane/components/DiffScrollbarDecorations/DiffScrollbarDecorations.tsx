import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useResolvedTheme } from "renderer/stores/theme";
import { getEditorTheme } from "shared/themes";
import { withAlpha } from "shared/themes/utils";
import { getDiffShadowRoots } from "../../utils/diffRendererRoots";

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

function collectDiffLineElements(container: HTMLDivElement): HTMLElement[] {
	return getDiffShadowRoots(container).flatMap((shadowRoot) =>
		Array.from(
			shadowRoot.querySelectorAll<HTMLElement>(
				"[data-line-type='change-addition'], [data-line-type='change-deletion']",
			),
		),
	);
}

function getDiffStructureSignature(
	container: HTMLDivElement,
	lineElements: HTMLElement[],
): string {
	let hash = 0;

	for (const element of lineElements) {
		const token = `${element.dataset.lineIndex ?? ""}:${element.dataset.lineType ?? ""}:${element.textContent?.length ?? 0}`;
		for (let index = 0; index < token.length; index += 1) {
			hash = (hash << 5) - hash + token.charCodeAt(index);
			hash |= 0;
		}
	}

	return [
		container.clientWidth,
		container.scrollHeight,
		lineElements.length,
		hash,
	].join(":");
}

function measureDiffRegions(
	container: HTMLDivElement,
	lineElements: HTMLElement[],
): DiffRegion[] {
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
	const structureSignatureRef = useRef<string | null>(null);
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
			structureSignatureRef.current = null;
			setRegions([]);
			return;
		}

		const lineElements = collectDiffLineElements(container);
		const structureSignature = getDiffStructureSignature(
			container,
			lineElements,
		);
		if (structureSignatureRef.current === structureSignature) {
			return;
		}

		structureSignatureRef.current = structureSignature;
		setRegions(measureDiffRegions(container, lineElements));
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
		const observedShadowRoots = new Set<ShadowRoot>();
		const observeShadowRoots = () => {
			for (const shadowRoot of getDiffShadowRoots(container)) {
				if (observedShadowRoots.has(shadowRoot)) {
					continue;
				}

				mutationObserver.observe(shadowRoot, {
					childList: true,
					subtree: true,
				});
				observedShadowRoots.add(shadowRoot);
			}
		};

		scheduleUpdate();
		container.addEventListener("scroll", updateViewport, { passive: true });

		const resizeObserver = new ResizeObserver(scheduleUpdate);
		resizeObserver.observe(container);
		const mutationObserver = new MutationObserver(() => {
			observeShadowRoots();
			scheduleUpdate();
		});
		mutationObserver.observe(container, {
			childList: true,
			subtree: true,
		});
		observeShadowRoots();

		return () => {
			cancelAnimationFrame(frameId);
			container.removeEventListener("scroll", updateViewport);
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	}, [scrollContainerRef, updateRegions, updateViewport]);

	const scrollToRatio = useCallback(
		(ratio: number) => {
			const container = scrollContainerRef.current;
			if (!container) return;

			const boundedRatio = Math.min(Math.max(ratio, 0), 1);
			const targetScroll =
				boundedRatio * container.scrollHeight - container.clientHeight / 2;
			container.scrollTo({ top: targetScroll, behavior: "smooth" });
		},
		[scrollContainerRef],
	);

	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			const rect = e.currentTarget.getBoundingClientRect();
			if (rect.height === 0) {
				return;
			}
			scrollToRatio((e.clientY - rect.top) / rect.height);
		},
		[scrollToRatio],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLButtonElement>) => {
			const container = scrollContainerRef.current;
			if (!container) return;

			switch (e.key) {
				case "Enter":
				case " ":
					e.preventDefault();
					scrollToRatio(0.5);
					break;
				case "Home":
					e.preventDefault();
					container.scrollTo({ top: 0, behavior: "smooth" });
					break;
				case "End":
					e.preventDefault();
					container.scrollTo({
						top: container.scrollHeight,
						behavior: "smooth",
					});
					break;
				case "PageDown":
				case "ArrowDown":
					e.preventDefault();
					container.scrollBy({
						top: container.clientHeight * 0.8,
						behavior: "smooth",
					});
					break;
				case "PageUp":
				case "ArrowUp":
					e.preventDefault();
					container.scrollBy({
						top: -container.clientHeight * 0.8,
						behavior: "smooth",
					});
					break;
				default:
					break;
			}
		},
		[scrollContainerRef, scrollToRatio],
	);

	if (regions.length === 0) return null;

	return (
		<button
			type="button"
			aria-label="Diff change overview"
			className="absolute top-0 right-0 bottom-0 w-2 cursor-pointer border-0 bg-transparent p-0"
			onClick={handleClick}
			onKeyDown={handleKeyDown}
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
		</button>
	);
}
