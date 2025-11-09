import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { motion, useMotionValue, useTransform } from "framer-motion";
import {
	File,
	FileEdit,
	FilePlus,
	FileText,
	FileX,
	GitBranch,
	Monitor,
	Plus,
	RefreshCw,
	Terminal as TerminalIcon,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Tab, Worktree } from "shared/types";
import { FileTree } from "../DiffView/FileTree";
import type { DiffViewData, FileDiff } from "../DiffView/types";

// Define sidebar modes
type SidebarMode = "tabs" | "changes";

interface Mode {
	id: SidebarMode;
	name: string;
	icon: React.ComponentType<{ size?: number }>;
}

const SIDEBAR_MODES: Mode[] = [
	{ id: "tabs", name: "Tabs", icon: FileText },
	{ id: "changes", name: "Changes", icon: GitBranch },
];

interface WorktreeTabsSidebarProps {
	worktree: Worktree | null;
	selectedTabId: string | null;
	onTabSelect: (tabId: string) => void;
	onTabClose: (tabId: string) => void;
	onCreateTerminal: () => void;
	onCreatePreview: () => void;
	workspaceId: string | null;
	workspaceName?: string;
	mainBranch?: string;
	onDiffFileSelect?: (fileId: string | null) => void;
	onModeChange?: (mode: SidebarMode) => void;
}

export const WorktreeTabsSidebar: React.FC<WorktreeTabsSidebarProps> = ({
	worktree,
	selectedTabId,
	onTabSelect,
	onTabClose,
	onCreateTerminal,
	onCreatePreview,
	workspaceId,
	workspaceName,
	mainBranch,
	onDiffFileSelect,
	onModeChange,
}) => {
	const [currentMode, setCurrentMode] = useState<SidebarMode>("tabs");
	const scrollProgress = useMotionValue(0);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
	const isInitialMount = useRef(true);
	const backgroundX = useMotionValue(0);

	// Diff/changes state
	const [diffData, setDiffData] = useState<DiffViewData | null>(null);
	const [loadingDiff, setLoadingDiff] = useState(false);
	const [diffError, setDiffError] = useState<string | null>(null);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);

	const tabs = worktree?.tabs || [];
	const currentModeIndex = SIDEBAR_MODES.findIndex((m) => m.id === currentMode);

	// Track scroll position and update motion value
	useEffect(() => {
		const scrollContainer = scrollContainerRef.current;
		if (!scrollContainer) return;

		let rafId: number | undefined;

		const updateProgress = () => {
			const scrollLeft = scrollContainer.scrollLeft;
			const containerWidth = scrollContainer.offsetWidth;
			const progress = scrollLeft / containerWidth;
			scrollProgress.set(progress);
		};

		const handleScroll = () => {
			if (rafId !== undefined) {
				cancelAnimationFrame(rafId);
			}
			rafId = requestAnimationFrame(updateProgress);
		};

		scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
		updateProgress();

		return () => {
			scrollContainer.removeEventListener("scroll", handleScroll);
			if (rafId !== undefined) {
				cancelAnimationFrame(rafId);
			}
		};
	}, [scrollProgress]);

	// Scroll to current mode when it changes
	useEffect(() => {
		const scrollContainer = scrollContainerRef.current;
		if (!scrollContainer) return;

		const targetScrollX = currentModeIndex * scrollContainer.offsetWidth;

		if (Math.abs(scrollContainer.scrollLeft - targetScrollX) > 10) {
			scrollContainer.scrollTo({
				left: targetScrollX,
				behavior: isInitialMount.current ? "auto" : "smooth",
			});
		}

		isInitialMount.current = false;
	}, [currentModeIndex]);

	// Detect when user finishes scrolling and update current mode
	useEffect(() => {
		const scrollContainer = scrollContainerRef.current;
		if (!scrollContainer) return;

		const handleScroll = () => {
			if (scrollTimeoutRef.current) {
				clearTimeout(scrollTimeoutRef.current);
			}

			scrollTimeoutRef.current = setTimeout(() => {
				const scrollLeft = scrollContainer.scrollLeft;
				const containerWidth = scrollContainer.offsetWidth;
				const newIndex = Math.round(scrollLeft / containerWidth);

				if (
					newIndex >= 0 &&
					newIndex < SIDEBAR_MODES.length &&
					SIDEBAR_MODES[newIndex].id !== currentMode
				) {
					const newMode = SIDEBAR_MODES[newIndex].id;
					setCurrentMode(newMode);
					onModeChange?.(newMode);
				}
			}, 150);
		};

		scrollContainer.addEventListener("scroll", handleScroll);

		return () => {
			scrollContainer.removeEventListener("scroll", handleScroll);
			if (scrollTimeoutRef.current) {
				clearTimeout(scrollTimeoutRef.current);
			}
		};
	}, [currentMode, onModeChange]);

	// Calculate sliding background position (each button is 40px wide including gap)
	useEffect(() => {
		const unsubscribe = scrollProgress.on("change", (latest) => {
			backgroundX.set(latest * 40);
		});
		return unsubscribe;
	}, [scrollProgress, backgroundX]);

	// Create opacity transforms for each mode (must be outside render loop)
	const mode0Opacity = useTransform(
		scrollProgress,
		[-0.5, 0, 0.5],
		[0.4, 1, 0.4],
	);
	const mode1Opacity = useTransform(
		scrollProgress,
		[0.5, 1, 1.5],
		[0.4, 1, 0.4],
	);

	const modeOpacities = [mode0Opacity, mode1Opacity];

	// Load diff data when switching to Changes mode
	const loadDiff = useCallback(async () => {
		if (!workspaceId || !worktree?.id) return;

		setLoadingDiff(true);
		setDiffError(null);

		try {
			const result = await window.ipcRenderer.invoke("worktree-get-git-diff", {
				workspaceId,
				worktreeId: worktree.id,
			});

			if (result?.success && result.diff) {
				const diffViewData: DiffViewData = {
					title: `Changes in ${worktree.branch}`,
					description: workspaceName,
					timestamp: new Date().toLocaleString(),
					files: result.diff.files,
				};
				setDiffData(diffViewData);
				if (diffViewData.files.length > 0 && !selectedFile) {
					setSelectedFile(diffViewData.files[0].id);
				}
			} else {
				setDiffError(result?.error || "Failed to load diff");
			}
		} catch (err) {
			setDiffError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoadingDiff(false);
		}
	}, [
		workspaceId,
		worktree?.id,
		worktree?.branch,
		workspaceName,
		selectedFile,
	]);

	// Load diff when switching to Changes mode
	useEffect(() => {
		if (currentMode === "changes" && !diffData && !loadingDiff) {
			loadDiff();
		}
	}, [currentMode, diffData, loadingDiff, loadDiff]);

	// Early return after all hooks
	if (!worktree || !workspaceId) {
		return (
			<div className="flex flex-col h-full p-4 text-neutral-400 text-sm">
				<p>No worktree selected</p>
			</div>
		);
	}

	// Helper to get icon for tab type
	const getTabIcon = (tab: Tab) => {
		switch (tab.type) {
			case "terminal":
				return <TerminalIcon size={14} />;
			case "preview":
				return <Monitor size={14} />;
			case "diff":
				return <GitBranch size={14} />;
			default:
				return <TerminalIcon size={14} />;
		}
	};

	// Helper to get icon for file diff status
	const getFileIcon = (status: FileDiff["status"]) => {
		switch (status) {
			case "added":
				return <FilePlus className="w-3.5 h-3.5 text-emerald-400" />;
			case "deleted":
				return <FileX className="w-3.5 h-3.5 text-rose-400" />;
			case "modified":
				return <FileEdit className="w-3.5 h-3.5 text-amber-400" />;
			default:
				return <File className="w-3.5 h-3.5 text-zinc-500" />;
		}
	};

	// Flatten tabs recursively (handle group tabs)
	const flattenTabs = (
		tabs: Tab[],
		level = 0,
	): Array<{ tab: Tab; level: number }> => {
		const result: Array<{ tab: Tab; level: number }> = [];
		for (const tab of tabs) {
			result.push({ tab, level });
			if (tab.type === "group" && tab.tabs) {
				result.push(...flattenTabs(tab.tabs, level + 1));
			}
		}
		return result;
	};

	const flatTabs = flattenTabs(tabs);

	// Filter out diff tabs - they should only be accessed through Changes mode
	const nonDiffTabs = flatTabs.filter(({ tab }) => tab.type !== "diff");

	// Render tabs mode content
	const renderTabsMode = () => (
		<>
			{/* Header with actions */}
			<div className="flex items-center justify-between p-3 border-b border-neutral-800">
				<h3 className="text-sm font-medium text-neutral-300">Tabs</h3>
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={onCreateTerminal}
								className="h-6 w-6 hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200"
							>
								<Plus size={14} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p className="text-xs">New Terminal</p>
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={onCreatePreview}
								className="h-6 w-6 hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200"
							>
								<Monitor size={14} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p className="text-xs">New Preview</p>
						</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{/* Tab list */}
			<div className="flex-1 overflow-y-auto">
				{nonDiffTabs.length === 0 ? (
					<div className="p-4 text-sm text-neutral-500">
						No tabs yet. Create a terminal or preview to get started.
					</div>
				) : (
					<div className="p-2">
						{nonDiffTabs.map(({ tab, level }) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => onTabSelect(tab.id)}
								className={`
									w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors group
									${selectedTabId === tab.id
										? "bg-neutral-800 text-neutral-100"
										: "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
									}
								`}
								style={{ paddingLeft: `${12 + level * 16}px` }}
							>
								<div className="flex items-center gap-2 min-w-0">
									{getTabIcon(tab)}
									<span className="truncate">{tab.name}</span>
								</div>
								{tab.type !== "group" && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onTabClose(tab.id);
										}}
										className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
									>
										<X size={14} />
									</button>
								)}
							</button>
						))}
					</div>
				)}
			</div>
		</>
	);

	// Render changes mode content
	const renderChangesMode = () => (
		<>
			{/* Header with actions */}
			<div className="flex items-center justify-between p-3 border-b border-neutral-800">
				<h3 className="text-sm font-medium text-neutral-300">Changes</h3>
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={loadDiff}
								disabled={loadingDiff}
								className="h-6 w-6 hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200"
							>
								<RefreshCw
									className={`w-3.5 h-3.5 ${loadingDiff ? "animate-spin" : ""}`}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p className="text-xs">Refresh changes</p>
						</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{/* Changes content */}
			<div className="flex-1 overflow-y-auto">
				{loadingDiff ? (
					<div className="flex items-center justify-center h-32">
						<div className="text-center space-y-2">
							<div className="animate-spin rounded-full h-6 w-6 border-2 border-neutral-700 border-t-neutral-400 mx-auto" />
							<p className="text-xs text-neutral-500">Loading changes...</p>
						</div>
					</div>
				) : diffError ? (
					<div className="p-4 text-center">
						<p className="text-xs text-red-400 mb-2">{diffError}</p>
						<Button
							onClick={loadDiff}
							variant="outline"
							size="sm"
							className="h-7 px-3 text-xs"
						>
							Try Again
						</Button>
					</div>
				) : !diffData || diffData.files.length === 0 ? (
					<div className="p-4 text-center">
						<p className="text-xs text-neutral-500 mb-1">No changes</p>
						<p className="text-[10px] text-neutral-600">
							No uncommitted changes in this worktree
						</p>
					</div>
				) : (
					<div className="py-2">
						<div className="px-3 py-1">
							<p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">
								Files Changed • {diffData.files.length}
							</p>
						</div>
						<div className="px-2">
							<FileTree
								files={diffData.files}
								selectedFile={selectedFile}
								onFileSelect={(fileId) => {
									setSelectedFile(fileId);
									onDiffFileSelect?.(fileId);
								}}
								getFileIcon={getFileIcon}
							/>
						</div>
					</div>
				)}
			</div>
		</>
	);

	return (
		<div className="flex flex-col h-full select-none text-neutral-300 text-sm">
			{/* Mode Switcher */}
			<div className="flex w-full border-b border-neutral-800 bg-neutral-950">
				<div className="relative flex items-center gap-2 px-2 py-2 w-full">
					{SIDEBAR_MODES.map((mode) => {
						const Icon = mode.icon;
						const isActive = currentMode === mode.id;

						return (
							<Tooltip key={mode.id}>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											console.log(
												"Mode clicked:",
												mode.id,
												"Current:",
												currentMode,
											);
											setCurrentMode(mode.id);
											onModeChange?.(mode.id);
										}}
										className={`relative z-20 flex h-8 w-8 items-center justify-center rounded-sm transition-all cursor-pointer ${isActive
											? "text-white bg-neutral-800"
											: "text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
											}`}
									>
										<Icon size={18} />
									</button>
								</TooltipTrigger>
								<TooltipContent side="top">
									<p>{mode.name}</p>
								</TooltipContent>
							</Tooltip>
						);
					})}
				</div>
			</div>

			{/* Mode Content Carousel */}
			<div
				ref={scrollContainerRef}
				className="flex-1 overflow-x-scroll overflow-y-hidden hide-scrollbar"
				style={{
					scrollSnapType: "x mandatory",
					WebkitOverflowScrolling: "touch",
					scrollbarWidth: "none",
					msOverflowStyle: "none",
				}}
			>
				<div
					className="flex h-full"
					style={{ width: `${SIDEBAR_MODES.length * 100}%` }}
				>
					{/* Tabs Mode */}
					<div
						className="flex flex-col overflow-y-auto"
						style={{
							scrollSnapAlign: "start",
							scrollSnapStop: "always",
							width: `${100 / SIDEBAR_MODES.length}%`,
						}}
					>
						{renderTabsMode()}
					</div>

					{/* Changes Mode */}
					<div
						className="flex flex-col overflow-y-auto"
						style={{
							scrollSnapAlign: "start",
							scrollSnapStop: "always",
							width: `${100 / SIDEBAR_MODES.length}%`,
						}}
					>
						{renderChangesMode()}
					</div>
				</div>
			</div>
		</div>
	);
};
