import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import {
	useCreateBranchWorkspace,
	useSetActiveWorkspace,
} from "renderer/react-query/workspaces";
import {
	useCurrentView,
	useIsSettingsTabOpen,
} from "renderer/stores/app-state";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { CreateWorkspaceButton } from "./CreateWorkspaceButton";
import { SettingsTab } from "./SettingsTab";
import { WorkspaceGroup } from "./WorkspaceGroup";

const MIN_WORKSPACE_WIDTH = 60;
const MAX_WORKSPACE_WIDTH = 160;
const ADD_BUTTON_WIDTH = 40;

export function WorkspacesTabs() {
	const { data: groups = [] } = trpc.workspaces.getAllGrouped.useQuery();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id || null;
	const setActiveWorkspace = useSetActiveWorkspace();
	const createBranchWorkspace = useCreateBranchWorkspace();
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

	// Track projects we've attempted to create workspaces for (persists across renders)
	// Using ref to avoid re-triggering the effect
	const attemptedProjectsRef = useRef<Set<string>>(new Set());
	const [isCreating, setIsCreating] = useState(false);

	// Auto-create main workspace for new projects (one-time per project)
	// This only runs for projects we haven't attempted yet
	useEffect(() => {
		if (isCreating) return;

		for (const group of groups) {
			const projectId = group.project.id;
			const hasMainWorkspace = group.workspaces.some(
				(w) => w.type === "branch",
			);

			// Skip if already has main workspace or we've already attempted this project
			if (hasMainWorkspace || attemptedProjectsRef.current.has(projectId)) {
				continue;
			}

			// Mark as attempted before creating (prevents retries)
			attemptedProjectsRef.current.add(projectId);
			setIsCreating(true);

			// Auto-create fails silently - this is a background convenience feature
			// Users can manually create the workspace via the dropdown if needed
			createBranchWorkspace.mutate(
				{ projectId },
				{
					onSettled: () => {
						setIsCreating(false);
					},
				},
			);
			// Only create one at a time
			break;
		}
	}, [groups, isCreating, createBranchWorkspace]);

	// Flatten workspaces for keyboard navigation
	const allWorkspaces = groups.flatMap((group) => group.workspaces);

	const handleWorkspaceSwitch = useCallback(
		(index: number) => {
			const workspace = allWorkspaces[index];
			if (workspace) {
				setActiveWorkspace.mutate({ id: workspace.id });
			}
		},
		[allWorkspaces, setActiveWorkspace],
	);

	const handlePrevWorkspace = useCallback(() => {
		if (!activeWorkspaceId) return;
		const currentIndex = allWorkspaces.findIndex(
			(w) => w.id === activeWorkspaceId,
		);
		if (currentIndex > 0) {
			setActiveWorkspace.mutate({ id: allWorkspaces[currentIndex - 1].id });
		}
	}, [activeWorkspaceId, allWorkspaces, setActiveWorkspace]);

	const handleNextWorkspace = useCallback(() => {
		if (!activeWorkspaceId) return;
		const currentIndex = allWorkspaces.findIndex(
			(w) => w.id === activeWorkspaceId,
		);
		if (currentIndex < allWorkspaces.length - 1) {
			setActiveWorkspace.mutate({ id: allWorkspaces[currentIndex + 1].id });
		}
	}, [activeWorkspaceId, allWorkspaces, setActiveWorkspace]);

	useAppHotkey(
		"JUMP_TO_WORKSPACE_1",
		() => handleWorkspaceSwitch(0),
		undefined,
		[handleWorkspaceSwitch],
	);
	useAppHotkey(
		"JUMP_TO_WORKSPACE_2",
		() => handleWorkspaceSwitch(1),
		undefined,
		[handleWorkspaceSwitch],
	);
	useAppHotkey(
		"JUMP_TO_WORKSPACE_3",
		() => handleWorkspaceSwitch(2),
		undefined,
		[handleWorkspaceSwitch],
	);
	useAppHotkey(
		"JUMP_TO_WORKSPACE_4",
		() => handleWorkspaceSwitch(3),
		undefined,
		[handleWorkspaceSwitch],
	);
	useAppHotkey(
		"JUMP_TO_WORKSPACE_5",
		() => handleWorkspaceSwitch(4),
		undefined,
		[handleWorkspaceSwitch],
	);
	useAppHotkey(
		"JUMP_TO_WORKSPACE_6",
		() => handleWorkspaceSwitch(5),
		undefined,
		[handleWorkspaceSwitch],
	);
	useAppHotkey(
		"JUMP_TO_WORKSPACE_7",
		() => handleWorkspaceSwitch(6),
		undefined,
		[handleWorkspaceSwitch],
	);
	useAppHotkey(
		"JUMP_TO_WORKSPACE_8",
		() => handleWorkspaceSwitch(7),
		undefined,
		[handleWorkspaceSwitch],
	);
	useAppHotkey(
		"JUMP_TO_WORKSPACE_9",
		() => handleWorkspaceSwitch(8),
		undefined,
		[handleWorkspaceSwitch],
	);
	useAppHotkey("PREV_WORKSPACE", handlePrevWorkspace, undefined, [
		handlePrevWorkspace,
	]);
	useAppHotkey("NEXT_WORKSPACE", handleNextWorkspace, undefined, [
		handleNextWorkspace,
	]);

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
