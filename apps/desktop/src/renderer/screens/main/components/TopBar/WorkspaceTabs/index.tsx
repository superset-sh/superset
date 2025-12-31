import { Fragment, useEffect, useRef, useState } from "react";
import { useWorkspaceShortcuts } from "renderer/hooks/useWorkspaceShortcuts";
import {
	useCurrentView,
	useIsSettingsTabOpen,
} from "renderer/stores/app-state";
import { CreateWorkspaceButton } from "./CreateWorkspaceButton";
import { SettingsTab } from "./SettingsTab";
import { WorkspaceGroup } from "./WorkspaceGroup";

const MIN_WORKSPACE_WIDTH = 60;
const MAX_WORKSPACE_WIDTH = 160;
const ADD_BUTTON_WIDTH = 40;

export function WorkspacesTabs() {
	// Use shared hook for workspace shortcuts and auto-create logic
	const { groups, allWorkspaces, activeWorkspaceId } = useWorkspaceShortcuts();

	const currentView = useCurrentView();
	const isSettingsTabOpen = useIsSettingsTabOpen();
	const isSettingsActive = currentView === "settings";
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
				Math.min(MAX_WORKSPACE_WIDTH, availableWidth / allWorkspaces.length),
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
	}, [allWorkspaces]);

	return (
		<div ref={containerRef} className="flex items-center h-full w-full">
			<div className="relative h-full overflow-hidden min-w-0 flex-1">
				<div
					ref={scrollRef}
					className="flex h-full overflow-x-auto hide-scrollbar gap-4 pr-10"
				>
					{groups.map((group, groupIndex) => (
						<Fragment key={group.project.id}>
							<WorkspaceGroup
								projectId={group.project.id}
								projectName={group.project.name}
								projectColor={group.project.color}
								projectIndex={groupIndex}
								workspaces={group.workspaces}
								activeWorkspaceId={isSettingsActive ? null : activeWorkspaceId}
								workspaceWidth={workspaceWidth}
								hoveredWorkspaceId={hoveredWorkspaceId}
								onWorkspaceHover={setHoveredWorkspaceId}
							/>
							{groupIndex < groups.length - 1 && (
								<div className="flex items-center h-full py-2">
									<div className="w-px h-full bg-border" />
								</div>
							)}
						</Fragment>
					))}
					{isSettingsTabOpen && (
						<>
							{groups.length > 0 && (
								<div className="flex items-center h-full py-2">
									<div className="w-px h-full bg-border" />
								</div>
							)}
							<SettingsTab width={workspaceWidth} isActive={isSettingsActive} />
						</>
					)}
				</div>

				{/* Left fade for scroll indication */}
				{showStartFade && (
					<div className="pointer-events-none absolute left-0 top-0 h-full w-8 bg-linear-to-r from-background to-transparent" />
				)}

				{/* Right side: gradient fade + button container */}
				<div className="absolute right-0 top-0 h-full flex items-center pointer-events-none">
					{/* Gradient fade - only show when content overflows */}
					{showEndFade && (
						<div className="h-full w-8 bg-linear-to-l from-background to-transparent" />
					)}
					{/* Button with solid background */}
					<div className="h-full flex items-center bg-background pl-1 pr-2 pointer-events-auto">
						<CreateWorkspaceButton className="no-drag" />
					</div>
				</div>
			</div>
		</div>
	);
}
