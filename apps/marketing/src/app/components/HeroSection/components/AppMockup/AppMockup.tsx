"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
	LuChevronDown,
	LuFile,
	LuFilePlus,
	LuFolder,
	LuFolderGit2,
	LuGitBranch,
	LuGitPullRequest,
	LuLayers,
	LuPanelLeft,
	LuPencil,
	LuPlus,
	LuRefreshCw,
	LuX,
} from "react-icons/lu";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function AsciiSpinner({ className }: { className?: string }) {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
		}, 80);
		return () => clearInterval(interval);
	}, []);

	return (
		<span className={`text-amber-500 font-mono select-none ${className}`}>
			{SPINNER_FRAMES[frameIndex]}
		</span>
	);
}

function StatusIndicator({
	status,
}: {
	status: "permission" | "working" | "review";
}) {
	const config = {
		permission: { ping: "bg-red-400", dot: "bg-red-500", pulse: true },
		working: { ping: "bg-amber-400", dot: "bg-amber-500", pulse: true },
		review: { ping: "", dot: "bg-green-500", pulse: false },
	}[status];

	return (
		<span className="relative flex size-2 shrink-0">
			{config.pulse && (
				<span
					className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.ping}`}
				/>
			)}
			<span
				className={`relative inline-flex size-2 rounded-full ${config.dot}`}
			/>
		</span>
	);
}

const WORKSPACES = [
	{ name: "main", branch: "main", isMain: true },
	{
		name: "autoupdate toast",
		branch: "autoupdate-toast",
		add: 46,
		del: 1,
		pr: "#733",
	},
	{
		name: "brew install",
		branch: "brew-install",
		add: 193,
		del: 0,
		pr: "#815",
	},
	{
		name: "fix option key",
		branch: "fix-option-key",
		add: 394,
		del: 23,
		pr: "#884",
		status: "review" as const,
	},
	{
		name: "ui blocking threads",
		branch: "ui-blocking-threads",
		add: 33,
		del: 0,
		pr: "#816",
	},
	{
		name: "cloud ws",
		branch: "cloud-ws",
		add: 5,
		del: 0,
		pr: "#827",
		isActive: true,
		status: "working" as const,
	},
	{
		name: "terminal bugs 2",
		branch: "terminal-bugs-2",
		add: 233,
		del: 188,
		pr: "#905",
		status: "permission" as const,
	},
	{ name: "feature parity", branch: "feature-parity", add: 207, del: 1 },
	{
		name: "allow binding hotkeys t...",
		branch: "allow-binding-hotkeys-to-preset",
		add: 461,
		del: 1,
	},
	{ name: "hero component", branch: "hero-component", add: 299, del: 2 },
	{ name: "terminal bug 3", branch: "terminal-bug-3", add: 37, del: 0 },
];

const FILE_CHANGES = [
	{ path: "bun.lock", add: 38, del: 25, indent: 0, type: "edit" },
	{
		path: "apps/api/src/app/api/electric/[...path]",
		add: 1,
		del: 0,
		indent: 0,
		type: "folder",
	},
	{ path: "utils.ts", add: 21, del: 4, indent: 1, type: "edit" },
	{ path: "route.ts", add: 1, del: 1, indent: 1, type: "edit" },
	{
		path: "apps/desktop/src/lib/trpc/routers",
		add: 0,
		del: 0,
		indent: 0,
		type: "folder",
	},
	{ path: "index.ts", add: 2, del: 0, indent: 1, type: "add" },
	{ path: "cloud-terminal", add: 0, del: 0, indent: 0, type: "folder" },
	{ path: "index.ts", add: 178, del: 0, indent: 1, type: "add" },
	{ path: "ssh-terminal", add: 0, del: 0, indent: 0, type: "folder" },
	{ path: "index.ts", add: 7, del: 0, indent: 1, type: "add" },
	{ path: "ssh-manager.ts", add: 277, del: 0, indent: 1, type: "add" },
	{ path: "NewCloudWorkspaceModal", add: 0, del: 0, indent: 0, type: "folder" },
	{ path: "index.ts", add: 4, del: 0, indent: 1, type: "add" },
	{
		path: "NewCloudWorkspaceModal...",
		add: 239,
		del: 0,
		indent: 1,
		type: "add",
	},
	{
		path: "useCloudWorkspaceMutati...",
		add: 121,
		del: 0,
		indent: 1,
		type: "add",
	},
	{ path: "useCloudWorkspaces.ts", add: 84, del: 0, indent: 1, type: "add" },
	{ path: "layout.tsx", add: 2, del: 0, indent: 1, type: "edit" },
	{ path: "collections.ts", add: 51, del: 17, indent: 1, type: "edit" },
	{ path: "WorkspaceSidebar.tsx", add: 14, del: 0, indent: 1, type: "edit" },
];

const PORTS = [
	{ workspace: "hero component", ports: ["3002"] },
	{
		workspace: "terminal bug 3",
		ports: ["3000", "3001", "5678", "5927", "31416"],
	},
];

function WorkspaceItem({
	name,
	branch,
	add,
	del,
	pr,
	isActive,
	isMain,
	status,
}: {
	name: string;
	branch: string;
	add?: number;
	del?: number;
	pr?: string;
	isActive?: boolean;
	isMain?: boolean;
	status?: "permission" | "working" | "review";
}) {
	return (
		<div
			className={`flex items-start gap-2 px-2 py-1 text-[10px] ${isActive ? "bg-white/10" : "hover:bg-white/5"} cursor-pointer relative`}
		>
			{isActive && (
				<div className="absolute left-0 top-0 bottom-0 w-0.5 bg-cyan-500 rounded-r" />
			)}
			<div className="mt-0.5 text-muted-foreground/50 relative">
				{status === "working" ? (
					<AsciiSpinner className="text-[10px]" />
				) : isMain ? (
					<LuFolder className="size-3.5" />
				) : (
					<LuFolderGit2 className="size-3.5" />
				)}
				{status && status !== "working" && (
					<span className="absolute -top-0.5 -right-0.5">
						<StatusIndicator status={status} />
					</span>
				)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center justify-between gap-1">
					<span
						className={`truncate ${isActive ? "text-foreground font-medium" : "text-foreground/80"}`}
					>
						{name}
					</span>
					{(add !== undefined || pr) && (
						<div className="flex items-center gap-1 shrink-0">
							{add !== undefined && (
								<span className="text-[9px]">
									<span className="text-emerald-400">+{add}</span>
									{del !== undefined && del > 0 && (
										<span className="text-red-400 ml-0.5">-{del}</span>
									)}
								</span>
							)}
						</div>
					)}
				</div>
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground/50 truncate text-[9px] font-mono">
						{branch}
					</span>
					{pr && (
						<span className="text-muted-foreground/40 text-[9px] flex items-center gap-0.5">
							<LuGitPullRequest className="size-2.5" />
							{pr}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

function FileChangeItem({
	path,
	add,
	del,
	indent,
	type,
}: {
	path: string;
	add: number;
	del: number;
	indent: number;
	type: string;
}) {
	const Icon =
		type === "folder"
			? LuFolder
			: type === "add"
				? LuFilePlus
				: type === "edit"
					? LuPencil
					: LuFile;
	const iconColor =
		type === "add"
			? "text-emerald-400"
			: type === "edit"
				? "text-amber-400"
				: "text-muted-foreground/50";

	return (
		<div
			className="flex items-center justify-between gap-1 py-0.5 text-[9px] hover:bg-white/5 px-2"
			style={{ paddingLeft: `${8 + indent * 12}px` }}
		>
			<div className="flex items-center gap-1.5 min-w-0">
				<Icon className={`size-3 shrink-0 ${iconColor}`} />
				<span className="text-muted-foreground/80 truncate">{path}</span>
			</div>
			{type !== "folder" && (add > 0 || del > 0) && (
				<span className="shrink-0 tabular-nums">
					{add > 0 && <span className="text-emerald-400">+{add}</span>}
					{del > 0 && <span className="text-red-400 ml-0.5">-{del}</span>}
				</span>
			)}
		</div>
	);
}

export function AppMockup() {
	return (
		<motion.div
			className="relative w-full rounded-lg overflow-hidden bg-[#0d0d0d] border border-white/10 shadow-2xl"
			style={{ aspectRatio: "16/10" }}
			initial={{ opacity: 0, scale: 0.98 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
		>
			{/* Window chrome */}
			<div className="flex items-center justify-between px-3 py-2 bg-[#1a1a1a] border-b border-white/10">
				<div className="flex items-center gap-1.5">
					<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
					<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
					<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
				</div>
				<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
					<span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
						<LuGitBranch className="size-3" />
						/cloud-ws
					</span>
					<span>Open</span>
					<LuChevronDown className="size-3 text-muted-foreground/50" />
					<span className="ml-2">KO</span>
					<span className="text-muted-foreground/70">Kiet's Org</span>
				</div>
				<div className="flex items-center gap-3 text-[10px] text-muted-foreground">
					<span>Base:</span>
					<span className="text-foreground">main</span>
					<span className="text-muted-foreground/50">(default)</span>
					<LuChevronDown className="size-3 text-muted-foreground/50" />
				</div>
			</div>

			<div className="flex h-[calc(100%-36px)]">
				{/* Left sidebar */}
				<div className="w-[180px] bg-[#111111] border-r border-white/10 flex flex-col shrink-0">
					{/* Workspaces header */}
					<div className="flex items-center justify-between px-2 py-2 border-b border-white/10">
						<div className="flex items-center gap-2">
							<button
								type="button"
								className="p-1 hover:bg-white/5 rounded text-muted-foreground/70"
							>
								<LuPanelLeft className="size-3.5" />
							</button>
							<button
								type="button"
								className="flex items-center gap-1.5 px-1.5 py-1 hover:bg-white/5 rounded text-muted-foreground"
							>
								<LuLayers className="size-3.5" />
								<span className="text-[11px]">Workspaces</span>
							</button>
						</div>
					</div>

					{/* New Workspace button */}
					<div className="px-2 py-2 border-b border-white/10">
						<button
							type="button"
							className="flex items-center gap-2 text-[10px] text-muted-foreground/70 hover:text-muted-foreground cursor-pointer w-full px-1.5 py-1 hover:bg-white/5 rounded"
						>
							<LuPlus className="size-3.5" />
							<span>New Workspace</span>
						</button>
					</div>

					{/* Repository section */}
					<div className="flex items-center justify-between px-2 py-1.5 border-b border-white/10 cursor-pointer hover:bg-white/5">
						<div className="flex items-center gap-2">
							<span className="text-cyan-400 text-[10px]">⟨:⟩</span>
							<span className="text-[11px] text-foreground/90">superset</span>
							<span className="text-[10px] text-muted-foreground/50">(11)</span>
						</div>
						<div className="flex items-center gap-1 text-muted-foreground/50">
							<LuPlus className="size-3" />
							<LuChevronDown className="size-3" />
						</div>
					</div>

					{/* Workspace list */}
					<div className="flex-1 overflow-hidden">
						{WORKSPACES.map((ws) => (
							<WorkspaceItem
								key={ws.branch}
								name={ws.name}
								branch={ws.branch}
								add={ws.add}
								del={ws.del}
								pr={ws.pr}
								isActive={ws.isActive}
								isMain={ws.isMain}
								status={ws.status}
							/>
						))}
					</div>

					{/* Ports section */}
					<div className="border-t border-white/10">
						<div className="flex items-center justify-between px-2 py-1.5">
							<div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
								<span>⌥</span>
								<span>Ports</span>
							</div>
							<span className="text-[9px] text-muted-foreground/40">6</span>
						</div>
						{PORTS.map((port) => (
							<div key={port.workspace} className="px-2 py-1">
								<div className="flex items-center justify-between text-[9px]">
									<span className="text-muted-foreground/60 truncate">
										{port.workspace}
									</span>
									<LuX className="size-2.5 text-muted-foreground/40" />
								</div>
								<div className="flex flex-wrap gap-1 mt-0.5">
									{port.ports.map((p) => (
										<span
											key={p}
											className="px-1.5 py-0.5 bg-white/5 rounded text-[9px] text-muted-foreground/70 tabular-nums"
										>
											{p}
										</span>
									))}
								</div>
							</div>
						))}
					</div>

					{/* Add repository */}
					<div className="px-2 py-2 border-t border-white/10">
						<button
							type="button"
							className="flex items-center gap-2 text-[10px] text-muted-foreground/50 cursor-pointer hover:text-muted-foreground w-full"
						>
							<LuPlus className="size-3" />
							<span>Add repository</span>
						</button>
					</div>
				</div>

				{/* Main content area */}
				<div className="flex-1 flex flex-col min-w-0">
					{/* Tab bar */}
					<div className="flex items-center gap-0.5 px-2 py-1 bg-[#141414] border-b border-white/10">
						<div className="flex items-center gap-2 px-3 py-1 bg-[#1e1e1e] rounded-t text-[10px] text-foreground/90 border-b-2 border-cyan-500">
							<span>claude</span>
							<LuX className="size-3 text-muted-foreground/50 hover:text-muted-foreground" />
						</div>
						<div className="flex items-center gap-2 px-3 py-1 text-[10px] text-muted-foreground/60 hover:bg-white/5 rounded-t">
							<span>Terminal 1</span>
							<LuX className="size-3 text-muted-foreground/30" />
						</div>
						<div className="flex items-center gap-2 px-3 py-1 text-[10px] text-muted-foreground/60 hover:bg-white/5 rounded-t">
							<span>mcp</span>
							<LuX className="size-3 text-muted-foreground/30" />
						</div>
						<div className="flex items-center px-2 py-1 text-muted-foreground/40 hover:text-muted-foreground/60 cursor-pointer">
							<LuPlus className="size-3.5" />
							<LuChevronDown className="size-3 ml-0.5" />
						</div>
					</div>

					{/* Terminal header */}
					<div className="flex items-center gap-2 px-3 py-1.5 bg-[#0f0f0f] border-b border-white/5">
						<span className="text-muted-foreground/50 text-[10px]">⬛</span>
						<span className="text-[10px] text-muted-foreground/70">
							Terminal
						</span>
						<div className="flex-1" />
						<span className="text-muted-foreground/30 text-[10px]">□</span>
						<LuX className="size-3 text-muted-foreground/30" />
					</div>

					{/* Terminal content */}
					<div className="flex-1 bg-[#0a0a0a] p-3 font-mono text-[10px] leading-relaxed overflow-hidden">
						{/* Claude ASCII art header */}
						<div className="flex items-start gap-3 mb-3">
							<div className="text-cyan-400 leading-none whitespace-pre text-[9px]">
								{`  * ▐▛███▜▌ *
 * ▝▜█████▛▘ *
  *  ▘▘ ▝▝  *`}
							</div>
							<div className="text-muted-foreground/90 text-[10px]">
								<div>
									<span className="text-foreground font-medium">
										Claude Code
									</span>{" "}
									v2.0.74
								</div>
								<div>Opus 4.5 · Claude Max</div>
								<div className="text-muted-foreground/60">
									~/.superset/worktrees/superset/cloud-ws
								</div>
							</div>
						</div>

						{/* Command prompt */}
						<div className="text-foreground mb-3">
							<span className="text-muted-foreground/60">❯</span>{" "}
							<span className="text-cyan-400">/mcp</span>
						</div>

						{/* MCP output */}
						<div className="border-t border-white/5 pt-3 space-y-2">
							<div>
								<span className="text-foreground font-medium">
									Manage MCP servers
								</span>
							</div>
							<div className="text-muted-foreground/70">1 server</div>

							<div className="mt-2">
								<span className="text-muted-foreground/50">❯</span>
								<span className="text-foreground ml-1">1.</span>
								<span className="text-cyan-400 ml-1">morph-mcp</span>
								<span className="text-emerald-400 ml-2">✓ connected</span>
								<span className="text-muted-foreground/50 ml-2">
									· Enter to view details
								</span>
							</div>

							<div className="mt-3 text-muted-foreground/70">
								<div>MCP Config locations (by scope):</div>
								<div className="ml-2">
									• User config (available in all your projects):
								</div>
								<div className="ml-4 text-muted-foreground/50">
									· /Users/kietho/.claude.json
								</div>
								<div className="ml-2">
									• Project config (shared via .mcp.json):
								</div>
								<div className="ml-4 text-muted-foreground/50">
									·
									/Users/kietho/.superset/worktrees/superset/cloud-ws/.mcp.json
								</div>
								<div className="ml-2">
									• Local config (private to you in this project):
								</div>
								<div className="ml-4 text-muted-foreground/50">
									· /Users/kietho/.claude.json [project: ...]
								</div>
							</div>

							<div className="mt-3 text-muted-foreground/70">
								<div>
									Tip: Use /mcp enable or /mcp disable to quickly toggle all
									servers
								</div>
							</div>

							<div className="mt-2 text-muted-foreground/50">
								For help configuring MCP servers, see:{" "}
								<span className="text-cyan-400/70">
									https://code.claude.com/docs/en/mcp
								</span>
							</div>

							<div className="mt-3 text-muted-foreground/60">
								Enter to confirm · Esc to cancel
							</div>
						</div>
					</div>
				</div>

				{/* Right sidebar */}
				<div className="w-[200px] bg-[#111111] border-l border-white/10 flex flex-col shrink-0">
					{/* Header icons */}
					<div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
						<div className="flex items-center gap-2 text-muted-foreground/50 text-[10px]">
							<LuFolder className="size-3.5" />
							<LuGitBranch className="size-3.5" />
							<LuRefreshCw className="size-3.5" />
						</div>
						<div className="flex items-center gap-1 text-[10px]">
							<LuGitPullRequest className="size-3.5 text-cyan-400" />
							<span className="text-muted-foreground/70">#827</span>
						</div>
					</div>

					{/* Commit message section */}
					<div className="px-3 py-2 border-b border-white/10">
						<div className="text-[10px] text-muted-foreground/60 mb-2">
							Commit message
						</div>
						<div className="h-8 bg-[#0a0a0a] rounded border border-white/10" />
					</div>

					{/* Push button */}
					<div className="px-3 py-2 border-b border-white/10">
						<button
							type="button"
							className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-[10px] bg-white/10 hover:bg-white/15 rounded text-foreground/90"
						>
							<span>↑</span>
							<span>Push</span>
							<span className="text-muted-foreground/60">26</span>
							<LuChevronDown className="size-3 text-muted-foreground/40 ml-auto" />
						</button>
					</div>

					{/* Against main */}
					<div className="px-3 py-2 border-b border-white/10">
						<div className="flex items-center justify-between text-[10px]">
							<div className="flex items-center gap-1">
								<LuChevronDown className="size-3 text-muted-foreground/50" />
								<span className="text-muted-foreground/70">Against main</span>
							</div>
							<span className="text-muted-foreground/50">46</span>
						</div>
					</div>

					{/* Root Path */}
					<div className="px-3 py-1.5 border-b border-white/10">
						<span className="text-[9px] text-muted-foreground/50">
							Root Path
						</span>
					</div>

					{/* File changes list */}
					<div className="flex-1 overflow-hidden">
						{FILE_CHANGES.map((file, i) => (
							<FileChangeItem
								key={`${file.path}-${i}`}
								path={file.path}
								add={file.add}
								del={file.del}
								indent={file.indent}
								type={file.type}
							/>
						))}
					</div>
				</div>
			</div>
		</motion.div>
	);
}
