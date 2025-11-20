import { Separator } from "@superset/ui/separator";
import { Fragment, useEffect, useRef, useState } from "react";
import { useWorkspacesStore } from "renderer/stores/workspaces";
import { AddWorkspaceButton } from "./AddWorkspaceButton";
import { WorkspaceItem } from "./WorkspaceItem";

const MIN_WORKSPACE_WIDTH = 60;
const MAX_WORKSPACE_WIDTH = 240;
const ADD_BUTTON_WIDTH = 48;

export function WorkspacesTabs() {
	const { workspaces, activeWorkspaceId } = useWorkspacesStore();
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [showStartFade, setShowStartFade] = useState(false);
	const [showEndFade, setShowEndFade] = useState(false);
	const [workspaceWidth, setWorkspaceWidth] = useState(MAX_WORKSPACE_WIDTH);
	const [hoveredWorkspaceId, setHoveredWorkspaceId] = useState<string | null>(
		null,
	);

	useEffect(() => {
		const checkScroll = () => {
			if (!scrollRef.current) return;

			const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
			setShowStartFade(scrollLeft > 0);
			setShowEndFade(scrollLeft < scrollWidth - clientWidth - 1);
		};

		const updateWorkspaceWidth = () => {
			if (!containerRef.current) return;

			const containerWidth = containerRef.current.offsetWidth;
			const availableWidth = containerWidth - ADD_BUTTON_WIDTH;

			// Calculate width: fill available space but respect min/max
			const calculatedWidth = Math.max(
				MIN_WORKSPACE_WIDTH,
				Math.min(MAX_WORKSPACE_WIDTH, availableWidth / workspaces.length),
			);
			setWorkspaceWidth(calculatedWidth);
		};

		checkScroll();
		updateWorkspaceWidth();

		const scrollElement = scrollRef.current;
		if (scrollElement) {
			scrollElement.addEventListener("scroll", checkScroll);
		}

		window.addEventListener("resize", updateWorkspaceWidth);

		return () => {
			if (scrollElement) {
				scrollElement.removeEventListener("scroll", checkScroll);
			}
			window.removeEventListener("resize", updateWorkspaceWidth);
		};
	}, [workspaces]);

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
					{workspaces.map((workspace, index) => {
						const nextWorkspace = workspaces[index + 1];
						const isActive = workspace.id === activeWorkspaceId;
						const isNextActive = nextWorkspace?.id === activeWorkspaceId;
						const isHovered = workspace.id === hoveredWorkspaceId;
						const isNextHovered = nextWorkspace?.id === hoveredWorkspaceId;
						const separatorOpacity =
							!isActive && !isNextActive && !isHovered && !isNextHovered
								? 100
								: 0;

						return (
							<Fragment key={workspace.id}>
								<div className="flex items-end h-full">
									<WorkspaceItem
										id={workspace.id}
										title={workspace.title}
										isActive={isActive}
										index={index}
										width={workspaceWidth}
										onMouseEnter={() => setHoveredWorkspaceId(workspace.id)}
										onMouseLeave={() => setHoveredWorkspaceId(null)}
									/>
								</div>
								{index < workspaces.length - 1 && (
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

			<AddWorkspaceButton />
		</div>
	);
}
