import { Separator } from "@superset/ui/separator";
import { Fragment, useEffect, useRef, useState } from "react";
import { useTabsStore } from "renderer/stores/tabs";
import { AddTabButton } from "./AddTabButton";
import { TabItem } from "./TabItem";

const MIN_TAB_WIDTH = 60;
const MAX_TAB_WIDTH = 240;
const ADD_BUTTON_WIDTH = 48;

export function Tabs() {
	const { tabs, activeTabId } = useTabsStore();
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [showStartFade, setShowStartFade] = useState(false);
	const [showEndFade, setShowEndFade] = useState(false);
	const [tabWidth, setTabWidth] = useState(MAX_TAB_WIDTH);
	const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);

	useEffect(() => {
		const checkScroll = () => {
			if (!scrollRef.current) return;

			const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
			setShowStartFade(scrollLeft > 0);
			setShowEndFade(scrollLeft < scrollWidth - clientWidth - 1);
		};

		const updateTabWidth = () => {
			if (!containerRef.current) return;

			const containerWidth = containerRef.current.offsetWidth;
			const availableWidth = containerWidth - ADD_BUTTON_WIDTH;

			// Calculate width: fill available space but respect min/max
			const calculatedWidth = Math.max(
				MIN_TAB_WIDTH,
				Math.min(MAX_TAB_WIDTH, availableWidth / tabs.length),
			);
			setTabWidth(calculatedWidth);
		};

		checkScroll();
		updateTabWidth();

		const scrollElement = scrollRef.current;
		if (scrollElement) {
			scrollElement.addEventListener("scroll", checkScroll);
		}

		window.addEventListener("resize", updateTabWidth);

		return () => {
			if (scrollElement) {
				scrollElement.removeEventListener("scroll", checkScroll);
			}
			window.removeEventListener("resize", updateTabWidth);
		};
	}, [tabs]);

	return (
		<div
			ref={containerRef}
			className="flex items-center h-full w-full"
			style={{ isolation: "isolate" }}
		>
			<div className="relative flex-1 h-full overflow-hidden w-full">
				<div
					ref={scrollRef}
					className="flex h-full overflow-x-auto hide-scrollbar gap-2"
				>
					{tabs.map((tab, index) => {
						const nextTab = tabs[index + 1];
						const isActive = tab.id === activeTabId;
						const isNextActive = nextTab?.id === activeTabId;
						const isHovered = tab.id === hoveredTabId;
						const isNextHovered = nextTab?.id === hoveredTabId;
						const separatorOpacity =
							!isActive && !isNextActive && !isHovered && !isNextHovered
								? 100
								: 0;

						return (
							<Fragment key={tab.id}>
								<div className="flex items-end h-full">
									<TabItem
										id={tab.id}
										title={tab.title}
										isActive={isActive}
										index={index}
										width={tabWidth}
										onMouseEnter={() => setHoveredTabId(tab.id)}
										onMouseLeave={() => setHoveredTabId(null)}
									/>
								</div>
								{index < tabs.length - 1 && (
									<div
										className="flex items-center h-full py-2 transition-opacity"
										style={{ opacity: separatorOpacity / 100 }}
									>
										<Separator orientation="vertical" />
									</div>
								)}
							</Fragment>
						);
					})}
				</div>

				{/* Fade effects for scroll indication */}
				{showStartFade && (
					<div className="pointer-events-none absolute left-0 top-0 h-full w-8 bg-linear-to-r from-background to-transparent" />
				)}
				{showEndFade && (
					<div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-linear-to-l from-background to-transparent" />
				)}
			</div>

			<AddTabButton />
		</div>
	);
}
