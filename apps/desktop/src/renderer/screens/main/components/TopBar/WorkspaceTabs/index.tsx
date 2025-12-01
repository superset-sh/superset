import { Fragment, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useSetActiveWorkspace } from "renderer/react-query/workspaces";
import { HOTKEYS } from "shared/hotkeys";
import { WorkspaceDropdown } from "./WorkspaceDropdown";
import { WorkspaceGroup } from "./WorkspaceGroup";

const MIN_WORKSPACE_WIDTH = 60;
const MAX_WORKSPACE_WIDTH = 160;
const ADD_BUTTON_WIDTH = 48;

export function WorkspacesTabs() {
	const { data: groups = [] } = trpc.workspaces.getAllGrouped.useQuery();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id || null;
	const setActiveWorkspace = useSetActiveWorkspace();
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [showStartFade, setShowStartFade] = useState(false);
	const [showEndFade, setShowEndFade] = useState(false);
	const [workspaceWidth, setWorkspaceWidth] = useState(MAX_WORKSPACE_WIDTH);
	const [hoveredWorkspaceId, setHoveredWorkspaceId] = useState<string | null>(
		null,
	);

	// Flatten workspaces for keyboard navigation
	const allWorkspaces = groups.flatMap((group) => group.workspaces);

	// Workspace switching shortcuts (⌘+1-9) - combined into single hook call
	const workspaceKeys = Array.from(
		{ length: 9 },
		(_, i) => `meta+${i + 1}`,
	).join(", ");
	useHotkeys(
		workspaceKeys,
		(event) => {
			const num = Number(event.key);
			if (num >= 1 && num <= 9) {
				const workspace = allWorkspaces[num - 1];
				if (workspace) {
					setActiveWorkspace.mutate({ id: workspace.id });
				}
			}
		},
		[allWorkspaces, setActiveWorkspace],
	);

	// Navigate to previous workspace (⌘+←)
	useHotkeys(HOTKEYS.PREV_WORKSPACE.keys, () => {
		if (!activeWorkspaceId) return;
		const currentIndex = allWorkspaces.findIndex(
			(w) => w.id === activeWorkspaceId,
		);
		if (currentIndex > 0) {
			setActiveWorkspace.mutate({ id: allWorkspaces[currentIndex - 1].id });
		}
	}, [activeWorkspaceId, allWorkspaces, setActiveWorkspace]);

	// Navigate to next workspace (⌘+→)
	useHotkeys(HOTKEYS.NEXT_WORKSPACE.keys, () => {
		if (!activeWorkspaceId) return;
		const currentIndex = allWorkspaces.findIndex(
			(w) => w.id === activeWorkspaceId,
		);
		if (currentIndex < allWorkspaces.length - 1) {
			setActiveWorkspace.mutate({ id: allWorkspaces[currentIndex + 1].id });
		}
	}, [activeWorkspaceId, allWorkspaces, setActiveWorkspace]);

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
			<div className="flex items-center h-full min-w-0">
				<div className="relative h-full overflow-hidden min-w-0">
					<div
						ref={scrollRef}
						className="flex h-full overflow-x-auto hide-scrollbar gap-4"
					>
						{groups.map((group, groupIndex) => (
							<Fragment key={group.project.id}>
								<WorkspaceGroup
									projectId={group.project.id}
									projectName={group.project.name}
									projectColor={group.project.color}
									projectIndex={groupIndex}
									workspaces={group.workspaces}
									activeWorkspaceId={activeWorkspaceId}
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
					</div>

					{/* Fade effects for scroll indication */}
					{showStartFade && (
						<div className="pointer-events-none absolute left-0 top-0 h-full w-8 bg-linear-to-r from-background to-transparent" />
					)}
					{showEndFade && (
						<div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-linear-to-l from-background to-transparent" />
					)}
				</div>
				<WorkspaceDropdown className="no-drag" />
			</div>
		</div>
	);
}
