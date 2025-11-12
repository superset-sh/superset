import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	GitCommit,
	GitPullRequest,
	MessageSquare,
	RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DiffContent } from "./DiffContent";
import { DiffSummary } from "./DiffSummary";
import type { DiffViewData, FileDiff } from "./types";

type ViewMode = "conversation" | "files";

interface DiffContentAreaProps {
	data: DiffViewData;
	selectedFile: string | null;
	onFileSelect: (fileId: string) => void;
	onRefresh?: () => void;
	isRefreshing?: boolean;
	loadFileContent?: (fileId: string) => void;
	loadedFiles?: Set<string>;
	loadingFiles?: Set<string>;
}

export function DiffContentArea({
	data,
	selectedFile,
	onFileSelect,
	onRefresh,
	isRefreshing = false,
	loadFileContent,
	loadedFiles = new Set(),
	loadingFiles = new Set(),
}: DiffContentAreaProps) {
	const [viewMode, setViewMode] = useState<ViewMode>("files");
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const loadedFilesRef = useRef(loadedFiles);
	const loadingFilesRef = useRef(loadingFiles);
	const loadFileContentRef = useRef(loadFileContent);

	// Keep refs in sync
	useEffect(() => {
		loadedFilesRef.current = loadedFiles;
		loadingFilesRef.current = loadingFiles;
		loadFileContentRef.current = loadFileContent;
	}, [loadedFiles, loadingFiles, loadFileContent]);

	// Load selected file immediately
	useEffect(() => {
		if (selectedFile && loadFileContent && !loadedFiles.has(selectedFile) && !loadingFiles.has(selectedFile)) {
			loadFileContent(selectedFile);
		}
	}, [selectedFile, loadFileContent, loadedFiles, loadingFiles]);

	// Use intersection observer to load files when they come into view
	useEffect(() => {
		if (viewMode !== "files" || !scrollContainerRef.current || !loadFileContent) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const fileId = entry.target.id.replace("file-diff-", "");
						if (fileId && !loadedFilesRef.current.has(fileId) && !loadingFilesRef.current.has(fileId)) {
							loadFileContentRef.current?.(fileId);
						}
					}
				}
			},
			{
				root: scrollContainerRef.current,
				rootMargin: "200px", // Start loading 200px before file comes into view
				threshold: 0.1,
			},
		);

		// Function to observe all file elements
		const observeFiles = () => {
			if (!scrollContainerRef.current) return;
			const elements =
				scrollContainerRef.current.querySelectorAll('[id^="file-diff-"]');
			elements.forEach((el) => {
				// Only observe if not already observed
				if (!observer.takeRecords().some((record) => record.target === el)) {
					observer.observe(el);
				}
			});
		};

		// Initial observation - use a timeout to batch DOM queries
		const timeoutId = setTimeout(observeFiles, 0);

		// Use MutationObserver to watch for new file elements being added
		const mutationObserver = new MutationObserver(() => {
			observeFiles();
		});

		if (scrollContainerRef.current) {
			mutationObserver.observe(scrollContainerRef.current, {
				childList: true,
				subtree: true,
			});
		}

		return () => {
			clearTimeout(timeoutId);
			mutationObserver.disconnect();
			observer.disconnect();
		};
	}, [viewMode]); // Only recreate when viewMode changes

	const getFileIcon = (status: FileDiff["status"]) => {
		switch (status) {
			case "added":
				return "➕";
			case "deleted":
				return "❌";
			case "modified":
				return "✏️";
			default:
				return "📄";
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

	// Sync with selectedFile prop - scroll to selected file when it changes
	useEffect(() => {
		if (!selectedFile || !scrollContainerRef.current) return;

		const selectedFileElement = document.getElementById(
			`file-diff-${selectedFile}`,
		);
		if (selectedFileElement) {
			// Scroll to selected file if it's not visible
			const container = scrollContainerRef.current;
			const elementRect = selectedFileElement.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();

			if (
				elementRect.top < containerRect.top ||
				elementRect.bottom > containerRect.bottom
			) {
				const scrollTop = container.scrollTop;
				const targetScrollTop =
					scrollTop + (elementRect.top - containerRect.top) - 20; // 20px offset from top

				container.scrollTo({
					top: targetScrollTop,
					behavior: "smooth",
				});
			}
		}
	}, [selectedFile]);

	return (
		<div className="h-full flex flex-col bg-[#1a1a1a]">
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
												<span>{getFileIcon(file.status)}</span>
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
					<div className="flex-1 flex flex-col overflow-hidden">
						<div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
							{data.files.map((file) => (
								<div
									key={file.id}
									id={`file-diff-${file.id}`}
									className={`border-b border-white/5 last:border-b-0 ${
										selectedFile === file.id ? "bg-white/[0.02]" : ""
									}`}
								>
									<DiffContent
										file={file}
										isLoading={loadingFiles.has(file.id)}
										onLoad={() => loadFileContent?.(file.id)}
									/>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

