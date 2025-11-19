import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	ChevronDown,
	ChevronRight,
	File,
	FileEdit,
	FilePlus,
	FileX,
	GitCommit,
	GitPullRequest,
	MessageSquare,
	PanelLeftClose,
	PanelLeftOpen,
	RefreshCw,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DiffContent } from "./DiffContent";
import { DiffSummary } from "./DiffSummary";
import { FileTree } from "./FileTree";
import type { DiffViewData, FileDiff } from "./types";

type ViewMode = "conversation" | "files";

interface DiffViewProps {
	data: DiffViewData;
	onRefresh?: () => void;
	isRefreshing?: boolean;
	onClose?: () => void;
}

export function DiffView({
	data,
	onRefresh,
	isRefreshing = false,
	onClose,
}: DiffViewProps) {
	const [viewMode, setViewMode] = useState<ViewMode>("files");
	const [selectedFile, setSelectedFile] = useState<string | null>(
		data.files[0]?.id || null,
	);
	const [showFileTree, setShowFileTree] = useState(true);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const isScrollingProgrammatically = useRef(false);

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

	const totalAdditions = data.files.reduce(
		(sum, file) => sum + file.additions,
		0,
	);
	const totalDeletions = data.files.reduce(
		(sum, file) => sum + file.deletions,
		0,
	);
	const filesChanged = data.files.length;

	// Set up intersection observer to track which file is at the top of the viewport
	useEffect(() => {
		if (viewMode !== "files" || !scrollContainerRef.current) return;

		const observer = new IntersectionObserver(
			(entries) => {
				// Only update if not scrolling programmatically
				if (isScrollingProgrammatically.current) return;

				// Find the topmost visible file
				// Filter entries that are intersecting
				const visibleEntries = entries.filter(
					(entry) => entry.isIntersecting && entry.intersectionRatio > 0,
				);

				if (visibleEntries.length === 0) return;

				// Sort by top position (smallest boundingClientRect.top is at the top)
				visibleEntries.sort((a, b) => {
					return a.boundingClientRect.top - b.boundingClientRect.top;
				});

				// Select the topmost file
				const topmostEntry = visibleEntries[0];
				const fileId = topmostEntry.target.id.replace("file-diff-", "");

				if (fileId) {
					setSelectedFile(fileId);
				}
			},
			{
				root: scrollContainerRef.current,
				rootMargin: "0px 0px -80% 0px", // Trigger when file enters top 20% of viewport
				threshold: [0, 0.1, 0.2, 0.3],
			},
		);

		// Observe all file diff elements
		const elements =
			scrollContainerRef.current.querySelectorAll('[id^="file-diff-"]');
		elements.forEach((el) => observer.observe(el));

		return () => {
			observer.disconnect();
		};
	}, [viewMode, data.files]);

	// Handle file selection from tree
	const handleFileSelect = (fileId: string) => {
		setSelectedFile(fileId);
		// Set flag to prevent intersection observer from updating during programmatic scroll
		isScrollingProgrammatically.current = true;

		// Scroll to the file using scrollTo for precise control
		const element = document.getElementById(`file-diff-${fileId}`);
		const container = scrollContainerRef.current;

		if (element && container) {
			// Calculate the element's position relative to the container
			const elementRect = element.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();
			const scrollTop = container.scrollTop;

			// Calculate target scroll position (element position relative to container top)
			const targetScrollTop = scrollTop + (elementRect.top - containerRect.top);

			// Smooth scroll to the target position
			container.scrollTo({
				top: targetScrollTop,
				behavior: "smooth",
			});
		}

		// Reset flag after scroll completes (approximate time for smooth scroll)
		setTimeout(() => {
			isScrollingProgrammatically.current = false;
		}, 1000);
	};

	return (
		<div className="h-screen flex flex-col bg-[#1a1a1a]">
			{/* GitHub-style header with title and actions */}
			<div className="border-b border-white/5 px-4 py-3 bg-[#1a1a1a]">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3 flex-1 min-w-0">
						<GitPullRequest className="w-4 h-4 text-zinc-500 shrink-0" />
						<h1 className="text-sm font-medium text-zinc-200 truncate">
							{data.title}
						</h1>
						{data.description && (
							<>
								<span className="text-xs text-zinc-600">•</span>
								<span className="text-xs text-zinc-500 truncate">
									{data.description}
								</span>
							</>
						)}
					</div>
					<div className="flex items-center gap-1 shrink-0">
						{onRefresh && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={onRefresh}
										disabled={isRefreshing}
										className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
									>
										<RefreshCw
											className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
										/>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<p>Refresh</p>
								</TooltipContent>
							</Tooltip>
						)}
						{onClose && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={onClose}
										className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
									>
										<X className="w-3.5 h-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<p>Close</p>
								</TooltipContent>
							</Tooltip>
						)}
					</div>
				</div>
			</div>

			{/* GitHub-style tabs */}
			<div className="border-b border-white/5 px-4 bg-[#1a1a1a]">
				<div className="flex items-center gap-1">
					<button
						onClick={() => setViewMode("conversation")}
						className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
							viewMode === "conversation"
								? "border-sky-500 text-zinc-100"
								: "border-transparent text-zinc-500 hover:text-zinc-300"
						}`}
						type="button"
					>
						<MessageSquare className="w-3.5 h-3.5" />
						Conversation
					</button>
					<button
						onClick={() => setViewMode("files")}
						className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
							viewMode === "files"
								? "border-sky-500 text-zinc-100"
								: "border-transparent text-zinc-500 hover:text-zinc-300"
						}`}
						type="button"
					>
						<GitCommit className="w-3.5 h-3.5" />
						Files changed
						<span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-white/10">
							{filesChanged}
						</span>
					</button>
				</div>
			</div>

			{/* Main content area */}
			<div className="flex flex-1 overflow-hidden">
				{viewMode === "conversation" ? (
					// Conversation view - placeholder for comments/activity
					<div className="flex-1 overflow-y-auto">
						<div className="max-w-4xl mx-auto py-6 px-4">
							{/* Summary card */}
							<div className="bg-white/[0.02] border border-white/5 rounded-lg p-4 mb-4">
								<div className="flex items-start gap-3">
									<div className="flex-1">
										<h3 className="text-sm font-medium text-zinc-200 mb-2">
											Changes Summary
										</h3>
										<div className="flex items-center gap-4 text-xs">
											<div className="flex items-center gap-2">
												<GitCommit className="w-3.5 h-3.5 text-zinc-500" />
												<span className="text-zinc-400">
													{filesChanged} files changed
												</span>
											</div>
											<div className="flex items-center gap-2">
												<span className="text-emerald-400">
													+{totalAdditions} additions
												</span>
											</div>
											<div className="flex items-center gap-2">
												<span className="text-rose-400">
													-{totalDeletions} deletions
												</span>
											</div>
										</div>
										{data.timestamp && (
											<div className="mt-3 text-xs text-zinc-500">
												Last updated {data.timestamp}
											</div>
										)}
									</div>
								</div>
							</div>

							{/* File summaries */}
							<div className="space-y-3">
								<h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
									File Changes
								</h3>
								{data.files
									.filter((file) => file.summary)
									.map((file) => (
										<div
											key={file.id}
											className="bg-white/[0.02] border border-white/5 rounded-lg p-4"
										>
											<div className="flex items-start gap-3 mb-3">
												{getFileIcon(file.status)}
												<div className="flex-1 min-w-0">
													<div className="text-xs font-medium text-zinc-200 truncate">
														{file.fileName}
													</div>
													<div className="text-[10px] text-zinc-600 truncate">
														{file.filePath}
													</div>
												</div>
												<div className="flex items-center gap-2 text-[10px]">
													{file.additions > 0 && (
														<span className="text-emerald-400">
															+{file.additions}
														</span>
													)}
													{file.deletions > 0 && (
														<span className="text-rose-400">
															-{file.deletions}
														</span>
													)}
												</div>
											</div>
											{file.summary && (
												<DiffSummary
													summary={file.summary}
													status={file.status}
												/>
											)}
										</div>
									))}
							</div>

							{/* Placeholder for comments */}
							<div className="mt-6 bg-white/[0.02] border border-white/5 rounded-lg p-6 text-center">
								<MessageSquare className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
								<p className="text-sm text-zinc-500">No comments yet</p>
								<p className="text-xs text-zinc-600 mt-1">
									Comments and activity will appear here
								</p>
							</div>
						</div>
					</div>
				) : (
					// Files changed view - scrollable list of all files (GitHub style)
					<>
						{/* File tree sidebar - kept mounted, hidden with display:none for instant toggle */}
						<div
							className={`w-72 border-r border-white/5 overflow-y-auto bg-[#1a1a1a] shrink-0 ${showFileTree ? "" : "hidden"}`}
						>
							<div className="py-2">
								<div className="flex items-center justify-between px-3 py-2">
									<h2 className="text-xs font-medium text-zinc-500">Files</h2>
									<div className="flex items-center gap-1">
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													onClick={() => setShowFileTree(false)}
													className="text-zinc-600 hover:text-zinc-400 transition-colors p-1 rounded hover:bg-white/5"
													type="button"
												>
													<PanelLeftClose className="w-3.5 h-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="bottom">
												<p>Hide file tree</p>
											</TooltipContent>
										</Tooltip>
									</div>
								</div>
								<div className="px-2">
									<FileTree
										files={data.files}
										selectedFile={selectedFile}
										onFileSelect={handleFileSelect}
										getFileIcon={getFileIcon}
									/>
								</div>
							</div>
						</div>

						{/* All files diff content - scrollable */}
						<div className="flex-1 flex flex-col overflow-hidden">
							{!showFileTree && (
								<div className="border-b border-white/5 px-3 py-2">
									<button
										onClick={() => setShowFileTree(true)}
										className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
										type="button"
									>
										<PanelLeftOpen className="w-3.5 h-3.5" />
										Show file tree
									</button>
								</div>
							)}
							<div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
								{data.files.map((file, index) => (
									<div
										key={file.id}
										id={`file-diff-${file.id}`}
										className="border-b border-white/5 last:border-b-0"
									>
										<DiffContent file={file} />
									</div>
								))}
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
