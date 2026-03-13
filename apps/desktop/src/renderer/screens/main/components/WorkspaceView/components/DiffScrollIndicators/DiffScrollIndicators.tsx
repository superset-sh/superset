import { parseDiffFromFile } from "@pierre/diffs";
import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { MIDNIGHT_CODE_COLORS } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/constants";

type ChangeType = "addition" | "deletion" | "modified";

interface ChangeRegion {
	startLine: number;
	lineCount: number;
	type: ChangeType;
}

interface DiffScrollIndicatorsProps {
	scrollRef: RefObject<HTMLElement | null>;
	original: string;
	modified: string;
	filePath: string;
}

const STRIP_WIDTH = 14;
const MIN_BAND_PX = 3;
const COLUMN_GAP = 3;
const TRACK_BG = "#1e2127";
const TRACK_BG_HOVER = "#22262e";
const VIEWPORT_THRESHOLD = 0.95;
const MIN_THUMB_PX = 20;

const DELETION_COLOR = `${MIDNIGHT_CODE_COLORS.deletion}cc`;
const ADDITION_COLOR = `${MIDNIGHT_CODE_COLORS.addition}cc`;

function computeRegions(
	original: string,
	modified: string,
	filePath: string,
): { regions: Array<ChangeRegion>; totalLines: number } {
	const diff = parseDiffFromFile(
		{ name: filePath, contents: original },
		{ name: filePath, contents: modified },
	);

	const modifiedLineCount = modified.split("\n").length;
	const totalLines = Math.max(modifiedLineCount, 1);
	const regions: Array<ChangeRegion> = [];

	for (const hunk of diff.hunks) {
		let currentLine = hunk.additionStart;

		for (const chunk of hunk.hunkContent) {
			if (chunk.type === "context") {
				currentLine += chunk.lines.length;
				continue;
			}

			const hasDeletions = chunk.deletions.length > 0;
			const hasAdditions = chunk.additions.length > 0;

			if (hasDeletions && hasAdditions) {
				regions.push({
					startLine: currentLine,
					lineCount: chunk.additions.length,
					type: "modified",
				});
				currentLine += chunk.additions.length;
			} else if (hasDeletions) {
				regions.push({
					startLine: currentLine,
					lineCount: Math.max(chunk.deletions.length, 1),
					type: "deletion",
				});
			} else if (hasAdditions) {
				regions.push({
					startLine: currentLine,
					lineCount: chunk.additions.length,
					type: "addition",
				});
				currentLine += chunk.additions.length;
			}
		}
	}

	return { regions, totalLines };
}

function renderBand(
	region: ChangeRegion,
	topPercent: number,
	heightPercent: number,
) {
	const bandStyle = {
		top: `${topPercent}%`,
		height: `max(${MIN_BAND_PX}px, ${heightPercent}%)`,
		borderRadius: 1,
	};

	if (region.type === "modified") {
		return (
			<div
				key={`mod-${region.startLine}`}
				className="absolute"
				style={{ ...bandStyle, left: 0, right: 0, display: "flex" }}
			>
				<div
					className="h-full"
					style={{ flex: 1, backgroundColor: DELETION_COLOR, borderRadius: 1 }}
				/>
				<div style={{ width: COLUMN_GAP }} />
				<div
					className="h-full"
					style={{ flex: 1, backgroundColor: ADDITION_COLOR, borderRadius: 1 }}
				/>
			</div>
		);
	}

	const isDeletion = region.type === "deletion";

	return (
		<div
			key={`${region.type}-${region.startLine}`}
			className="absolute"
			style={{
				...bandStyle,
				left: isDeletion ? 0 : `calc(50% + ${COLUMN_GAP / 2}px)`,
				right: isDeletion ? `calc(50% + ${COLUMN_GAP / 2}px)` : 0,
				backgroundColor: isDeletion ? DELETION_COLOR : ADDITION_COLOR,
			}}
		/>
	);
}

export function DiffScrollIndicators({
	scrollRef,
	original,
	modified,
	filePath,
}: DiffScrollIndicatorsProps) {
	const [viewportRatio, setViewportRatio] = useState({ top: 0, height: 1 });
	const trackRef = useRef<HTMLDivElement | null>(null);

	const { regions, totalLines } = useMemo(
		() => computeRegions(original, modified, filePath),
		[original, modified, filePath],
	);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;

		const updateViewport = () => {
			const sh = el.scrollHeight;
			if (sh > 0) {
				setViewportRatio({
					top: el.scrollTop / sh,
					height: el.clientHeight / sh,
				});
			}
		};

		updateViewport();
		el.addEventListener("scroll", updateViewport, { passive: true });
		const resizeObserver = new ResizeObserver(updateViewport);
		resizeObserver.observe(el);

		return () => {
			el.removeEventListener("scroll", updateViewport);
			resizeObserver.disconnect();
		};
	}, [scrollRef]);

	const handleClick = useCallback(
		(event: React.MouseEvent) => {
			const el = scrollRef.current;
			const track = trackRef.current;
			if (!el || !track) return;

			const rect = track.getBoundingClientRect();
			const ratio = (event.clientY - rect.top) / rect.height;
			const targetScroll = ratio * el.scrollHeight - el.clientHeight / 2;
			const prefersReduced = window.matchMedia(
				"(prefers-reduced-motion: reduce)",
			).matches;
			el.scrollTo({
				top: targetScroll,
				behavior: prefersReduced ? "auto" : "smooth",
			});
		},
		[scrollRef],
	);

	function handleMouseEnter() {
		if (trackRef.current) {
			trackRef.current.style.backgroundColor = TRACK_BG_HOVER;
		}
	}

	function handleMouseLeave() {
		if (trackRef.current) {
			trackRef.current.style.backgroundColor = TRACK_BG;
		}
	}

	if (regions.length === 0) return null;

	const showViewportThumb = viewportRatio.height < VIEWPORT_THRESHOLD;

	return (
		<div
			ref={trackRef}
			aria-hidden="true"
			className="shrink-0 cursor-pointer"
			style={{
				width: STRIP_WIDTH,
				backgroundColor: TRACK_BG,
				borderLeft: `1px solid ${MIDNIGHT_CODE_COLORS.border}`,
				position: "relative",
				overflow: "hidden",
				transition: "background-color 150ms",
			}}
			onClick={handleClick}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{regions.map((region) => {
				const topPercent = ((region.startLine - 1) / totalLines) * 100;
				const heightPercent = (region.lineCount / totalLines) * 100;
				return renderBand(region, topPercent, heightPercent);
			})}

			{showViewportThumb && (
				<div
					className="absolute left-0 right-0 pointer-events-none"
					style={{
						top: `${viewportRatio.top * 100}%`,
						height: `max(${MIN_THUMB_PX}px, ${viewportRatio.height * 100}%)`,
						backgroundColor: "rgba(255, 255, 255, 0.08)",
						borderTop: "1px solid rgba(255, 255, 255, 0.15)",
						borderBottom: "1px solid rgba(255, 255, 255, 0.15)",
					}}
				/>
			)}
		</div>
	);
}
