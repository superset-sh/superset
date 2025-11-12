import { Loader2 } from "lucide-react";
import { memo, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { detectLanguage } from "./languageDetector";
import type { DiffLine, FileDiff } from "./types";

interface DiffContentProps {
	file: FileDiff;
	isLoading?: boolean;
	onLoad?: () => void;
}

export const DiffContent = memo(function DiffContent({
	file,
	isLoading = false,
	onLoad,
}: DiffContentProps) {
	const language = detectLanguage(file.fileName);

	// Trigger load when component mounts if content is not loaded
	useEffect(() => {
		if (file.changes.length === 0 && !isLoading && onLoad) {
			onLoad();
		}
	}, [file.changes.length, isLoading, onLoad]);

	const renderDiffLine = (line: DiffLine, index: number) => {
		const getBgColor = () => {
			switch (line.type) {
				case "added":
					return "bg-emerald-500/8 hover:bg-emerald-500/10";
				case "removed":
					return "bg-rose-500/8 hover:bg-rose-500/10";
				case "modified":
					return "bg-amber-500/8 hover:bg-amber-500/10";
				default:
					return "hover:bg-white/[0.02]";
			}
		};

		const getTextColor = () => {
			switch (line.type) {
				case "added":
					return "text-zinc-100";
				case "removed":
					return "text-zinc-100";
				case "modified":
					return "text-zinc-100";
				default:
					return "text-zinc-300";
			}
		};

		const getLinePrefix = () => {
			switch (line.type) {
				case "added":
					return "+";
				case "removed":
					return "-";
				default:
					return " ";
			}
		};

		const getMarkerColor = () => {
			switch (line.type) {
				case "added":
					return "text-emerald-400";
				case "removed":
					return "text-rose-400";
				case "modified":
					return "text-amber-400";
				default:
					return "text-transparent";
			}
		};

		const getBorderColor = () => {
			switch (line.type) {
				case "added":
					return "border-l-emerald-500/30";
				case "removed":
					return "border-l-rose-500/30";
				case "modified":
					return "border-l-amber-500/30";
				default:
					return "border-l-transparent";
			}
		};

		return (
			<div
				key={index}
				className={`flex font-mono text-[13px] leading-relaxed border-l-2 transition-colors ${getBorderColor()} ${getBgColor()}`}
			>
				<div className="shrink-0 w-10 text-right pr-2 text-zinc-600 bg-[#1a1a1a] border-r border-white/5 select-none">
					{line.oldLineNumber || ""}
				</div>
				<div className="shrink-0 w-10 text-right pr-2 text-zinc-600 bg-[#1a1a1a] border-r border-white/5 select-none">
					{line.newLineNumber || ""}
				</div>
				<div
					className={`shrink-0 w-7 text-center ${getMarkerColor()} select-none font-semibold`}
				>
					{getLinePrefix()}
				</div>
				<div className={`flex-1 pr-4`}>
					<SyntaxHighlighter
						language={language}
						style={vscDarkPlus}
						customStyle={{
							margin: 0,
							padding: 0,
							background: "transparent",
							fontSize: "inherit",
							lineHeight: "inherit",
						}}
						codeTagProps={{
							style: {
								fontFamily: "inherit",
								background: "transparent",
							},
						}}
						PreTag="div"
						className="inline-block"
					>
						{line.content || " "}
					</SyntaxHighlighter>
				</div>
			</div>
		);
	};

	return (
		<div className="h-full flex flex-col bg-[#1a1a1a]">
			{/* Sticky file header with cleaner design */}
			<div className="sticky top-0 z-10 border-b border-white/5 px-4 py-2.5 bg-[#1a1a1a] backdrop-blur">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3 flex-1 min-w-0">
						<h3 className="text-xs font-medium text-zinc-200 truncate">
							{file.fileName}
						</h3>
						<span className="text-[10px] text-zinc-600 truncate">
							{file.filePath}
						</span>
					</div>
					<div className="flex items-center gap-3 shrink-0">
						{file.oldPath && file.status === "renamed" && (
							<div className="text-[10px] text-zinc-500">
								from{" "}
								<span className="font-medium text-zinc-400">
									{file.oldPath}
								</span>
							</div>
						)}
						<span
							className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${file.status === "added"
								? "bg-emerald-500/10 text-emerald-400"
								: file.status === "deleted"
									? "bg-rose-500/10 text-rose-400"
									: file.status === "modified"
										? "bg-amber-500/10 text-amber-400"
										: "bg-white/5 text-zinc-400"
								}`}
						>
							{file.status}
						</span>
					</div>
				</div>
			</div>
			{/* Diff content area */}
			<div className="flex-1 overflow-auto">
				{isLoading || file.changes.length === 0 ? (
					<div className="flex items-center justify-center h-full min-h-[200px]">
						<div className="flex flex-col items-center gap-2 text-zinc-500">
							<Loader2 className="w-5 h-5 animate-spin" />
							<span className="text-xs">Loading diff content...</span>
						</div>
					</div>
				) : (
					<div className="min-w-max">
						{file.changes.map((line, index) => renderDiffLine(line, index))}
					</div>
				)}
			</div>
		</div>
	);
});
