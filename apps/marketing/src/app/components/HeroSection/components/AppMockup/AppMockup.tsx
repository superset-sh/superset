"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
	LuChevronDown,
	LuFile,
	LuFilePlus,
	LuFolder,
	LuFolderGit2,
	LuGitPullRequest,
	LuPencil,
	LuPlus,
	LuTerminal,
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
	{
		name: "use any agents",
		branch: "use-any-agents",
		add: 46,
		del: 1,
		pr: "#733",
		isActive: true,
		status: "working" as const,
	},
	{
		name: "create parallel branches",
		branch: "create-parallel-branches",
		add: 193,
		del: 0,
		pr: "#815",
		status: "review" as const,
	},
	{
		name: "see changes",
		branch: "see-changes",
		add: 394,
		del: 23,
		pr: "#884",
	},
	{
		name: "open in any IDE",
		branch: "open-in-any-ide",
		add: 33,
		del: 0,
		pr: "#816",
		status: "permission" as const,
	},
	{
		name: "forward ports",
		branch: "forward-ports",
		add: 127,
		del: 8,
		pr: "#902",
	},
];

const FILE_CHANGES = [
	{ path: "bun.lock", add: 38, del: 25, type: "edit" },
	{ path: "packages/db/src/schema", type: "folder" },
	{ path: "cloud-workspace.ts", add: 119, del: 0, type: "add", indent: 1 },
	{ path: "enums.ts", add: 21, del: 0, type: "edit", indent: 1 },
	{ path: "apps/desktop/src/renderer", type: "folder" },
	{ path: "CloudTerminal.tsx", add: 169, del: 0, type: "add", indent: 1 },
	{ path: "useCloudWorkspaces.ts", add: 84, del: 0, type: "add", indent: 1 },
	{ path: "WorkspaceSidebar.tsx", add: 14, del: 0, type: "edit", indent: 1 },
	{ path: "apps/api/src/trpc/routers", type: "folder" },
	{ path: "ssh-manager.ts", add: 277, del: 0, type: "add", indent: 1 },
	{ path: "index.ts", add: 7, del: 0, type: "edit", indent: 1 },
];

const PORTS = [
	{ workspace: "use any agents", ports: ["3002"] },
	{
		workspace: "see changes",
		ports: ["3000", "3001", "5678"],
	},
];

function WorkspaceItem({
	name,
	branch,
	add,
	del,
	pr,
	isActive,
	status,
}: {
	name: string;
	branch: string;
	add?: number;
	del?: number;
	pr?: string;
	isActive?: boolean;
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
	add = 0,
	del = 0,
	indent = 0,
	type,
}: {
	path: string;
	add?: number;
	del?: number;
	indent?: number;
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

	const isFolder = type === "folder";

	return (
		<div
			className={`flex items-center justify-between gap-2 hover:bg-white/5 px-3 ${isFolder ? "py-1.5 mt-1" : "py-1"}`}
			style={{ paddingLeft: `${12 + (indent || 0) * 14}px` }}
		>
			<div className="flex items-center gap-2 min-w-0">
				<Icon className={`size-3.5 shrink-0 ${iconColor}`} />
				<span
					className={`truncate ${isFolder ? "text-muted-foreground/60 text-[9px]" : "text-muted-foreground/80 text-[10px]"}`}
				>
					{path}
				</span>
			</div>
			{!isFolder && (add > 0 || del > 0) && (
				<span className="shrink-0 tabular-nums text-[9px]">
					{add > 0 && <span className="text-emerald-400">+{add}</span>}
					{del > 0 && <span className="text-red-400 ml-1">-{del}</span>}
				</span>
			)}
		</div>
	);
}

export type ActiveDemo =
	| "Use Any Agents"
	| "Create Parallel Branches"
	| "See Changes"
	| "Open in Any IDE";

interface AppMockupProps {
	activeDemo?: ActiveDemo;
}

export function AppMockup({ activeDemo = "Use Any Agents" }: AppMockupProps) {
	// Animation states based on activeDemo
	// - "Use Any Agents": Highlight terminal area with agent output
	// - "Create Parallel Branches": Highlight workspace sidebar with branches
	// - "See Changes": Highlight file changes panel on right
	// - "Open in Any IDE": Highlight top bar / open actions

	return (
		<div
			className="relative w-full min-w-[600px] rounded-xl overflow-hidden bg-black/40 backdrop-blur-xl border border-white/[0.08] shadow-2xl"
			style={{ aspectRatio: "16/10" }}
		>
			{/* Window chrome */}
			<div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] backdrop-blur-md border-b border-white/[0.06]">
				<div className="flex items-center gap-1.5">
					<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
					<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
					<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
				</div>
				<span className="text-[11px] text-muted-foreground/70">superset</span>
				<div className="w-12" />
			</div>

			<div className="flex h-[calc(100%-36px)]">
				{/* Left sidebar */}
				<div className="w-[180px] bg-white/[0.02] backdrop-blur-lg border-r border-white/[0.06] flex flex-col shrink-0">
					{/* New Workspace button */}
					<div className="px-2 py-2 border-b border-white/[0.06]">
						<button
							type="button"
							className="flex items-center gap-2 text-[10px] text-muted-foreground/60 hover:text-muted-foreground cursor-pointer w-full px-1.5 py-1 hover:bg-white/[0.04] rounded"
						>
							<LuPlus className="size-3.5" />
							<span>New Workspace</span>
						</button>
					</div>

					{/* Repository section */}
					<div className="flex items-center justify-between px-2 py-1.5 border-b border-white/[0.06] cursor-pointer hover:bg-white/[0.04]">
						<div className="flex items-center gap-2">
							<span className="text-[11px] text-foreground/90">superset</span>
							<span className="text-[10px] text-muted-foreground/50">(5)</span>
						</div>
						<div className="flex items-center gap-1 text-muted-foreground/50">
							<LuPlus className="size-3" />
							<LuChevronDown className="size-3" />
						</div>
					</div>

					{/* Workspace list */}
					<div className="flex-1 overflow-hidden">
						{/* New workspace - shown when "Create Parallel Branches" is active */}
						<motion.div
							className="overflow-hidden"
							initial={{ height: 0, opacity: 0 }}
							animate={{
								height: activeDemo === "Create Parallel Branches" ? "auto" : 0,
								opacity: activeDemo === "Create Parallel Branches" ? 1 : 0,
							}}
							transition={{ duration: 0.3, ease: "easeOut" }}
						>
							<div className="flex items-start gap-2 px-2 py-1 text-[10px] bg-cyan-500/10 border-l-2 border-cyan-500 relative">
								<div className="mt-0.5 text-muted-foreground/50 relative">
									<AsciiSpinner className="text-[10px]" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between gap-1">
										<span className="truncate text-foreground font-medium">
											new workspace
										</span>
									</div>
									<span className="text-muted-foreground/50 truncate text-[9px] font-mono">
										creating...
									</span>
								</div>
							</div>
						</motion.div>
						{WORKSPACES.map((ws) => {
							const isFirstItem = ws.name === "use any agents";
							const shouldHideActiveState =
								isFirstItem && activeDemo === "Create Parallel Branches";
							return (
								<WorkspaceItem
									key={ws.branch}
									name={ws.name}
									branch={ws.branch}
									add={ws.add}
									del={ws.del}
									pr={ws.pr}
									isActive={shouldHideActiveState ? false : ws.isActive}
									status={shouldHideActiveState ? undefined : ws.status}
								/>
							);
						})}
					</div>

					{/* Ports section */}
					<div className="border-t border-white/[0.06]">
						<div className="flex items-center justify-between px-2 py-1.5">
							<div className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
								<span>⌥</span>
								<span>Ports</span>
							</div>
							<span className="text-[9px] text-muted-foreground/30">4</span>
						</div>
						{PORTS.map((port) => (
							<div key={port.workspace} className="px-2 py-1">
								<div className="flex items-center justify-between text-[9px]">
									<span className="text-muted-foreground/50 truncate">
										{port.workspace}
									</span>
									<LuX className="size-2.5 text-muted-foreground/30" />
								</div>
								<div className="flex flex-wrap gap-1 mt-0.5">
									{port.ports.map((p) => (
										<span
											key={p}
											className="px-1.5 py-0.5 bg-white/[0.04] rounded text-[9px] text-muted-foreground/60 tabular-nums"
										>
											{p}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Main content area */}
				<div className="flex-1 flex flex-col min-w-0">
					{/* Tab bar */}
					<div className="flex items-center gap-0.5 px-2 py-1 bg-white/[0.02] backdrop-blur-md border-b border-white/[0.06]">
						{/* Claude tab - always visible, active */}
						<div className="flex items-center gap-1.5 px-3 py-1 bg-white/[0.06] backdrop-blur-sm rounded-t text-[10px] text-foreground/90 border-b-2 border-cyan-500/70">
							{activeDemo === "Create Parallel Branches" ? (
								<>
									<LuTerminal className="size-3 text-muted-foreground/70" />
									<span>setup</span>
								</>
							) : (
								<>
									<Image
										src="/app-icons/claude.svg"
										alt="Claude"
										width={12}
										height={12}
									/>
									<span>claude</span>
								</>
							)}
							<LuX className="size-3 text-muted-foreground/50 hover:text-muted-foreground" />
						</div>
						{/* Other agent tabs - shown when "Use Any Agents" is active */}
						<motion.div
							className="flex items-center gap-1.5 py-1 text-[10px] text-muted-foreground/60 hover:bg-white/5 rounded-t overflow-hidden"
							initial={{
								opacity: 0,
								width: 0,
								paddingLeft: 0,
								paddingRight: 0,
							}}
							animate={{
								opacity: activeDemo === "Use Any Agents" ? 1 : 0,
								width: activeDemo === "Use Any Agents" ? "auto" : 0,
								paddingLeft: activeDemo === "Use Any Agents" ? 12 : 0,
								paddingRight: activeDemo === "Use Any Agents" ? 12 : 0,
							}}
							transition={{
								duration: 0.25,
								ease: "easeOut",
								delay: activeDemo === "Use Any Agents" ? 0.1 : 0,
							}}
						>
							<Image
								src="/app-icons/codex.svg"
								alt="Codex"
								width={12}
								height={12}
							/>
							<span>codex</span>
							<LuX className="size-3 text-muted-foreground/30" />
						</motion.div>
						<motion.div
							className="flex items-center gap-1.5 py-1 text-[10px] text-muted-foreground/60 hover:bg-white/5 rounded-t overflow-hidden"
							initial={{
								opacity: 0,
								width: 0,
								paddingLeft: 0,
								paddingRight: 0,
							}}
							animate={{
								opacity: activeDemo === "Use Any Agents" ? 1 : 0,
								width: activeDemo === "Use Any Agents" ? "auto" : 0,
								paddingLeft: activeDemo === "Use Any Agents" ? 12 : 0,
								paddingRight: activeDemo === "Use Any Agents" ? 12 : 0,
							}}
							transition={{
								duration: 0.25,
								ease: "easeOut",
								delay: activeDemo === "Use Any Agents" ? 0.25 : 0,
							}}
						>
							<Image
								src="/app-icons/gemini.svg"
								alt="Gemini"
								width={12}
								height={12}
							/>
							<span>gemini</span>
							<LuX className="size-3 text-muted-foreground/30" />
						</motion.div>
						<motion.div
							className="flex items-center gap-1.5 py-1 text-[10px] text-muted-foreground/60 hover:bg-white/5 rounded-t overflow-hidden"
							initial={{
								opacity: 0,
								width: 0,
								paddingLeft: 0,
								paddingRight: 0,
							}}
							animate={{
								opacity: activeDemo === "Use Any Agents" ? 1 : 0,
								width: activeDemo === "Use Any Agents" ? "auto" : 0,
								paddingLeft: activeDemo === "Use Any Agents" ? 12 : 0,
								paddingRight: activeDemo === "Use Any Agents" ? 12 : 0,
							}}
							transition={{
								duration: 0.25,
								ease: "easeOut",
								delay: activeDemo === "Use Any Agents" ? 0.4 : 0,
							}}
						>
							<Image
								src="/app-icons/cursor-agent.svg"
								alt="Cursor"
								width={12}
								height={12}
							/>
							<span>cursor</span>
							<LuX className="size-3 text-muted-foreground/30" />
						</motion.div>
						<div className="flex items-center px-2 py-1 text-muted-foreground/40 hover:text-muted-foreground/60 cursor-pointer">
							<LuPlus className="size-3.5" />
							<LuChevronDown className="size-3 ml-0.5" />
						</div>
					</div>

					{/* Terminal header */}
					<div className="flex items-center gap-2 px-3 py-1.5 bg-black/20 border-b border-white/[0.04]">
						<span className="text-muted-foreground/40 text-[10px]">⬛</span>
						<span className="text-[10px] text-muted-foreground/60">
							Terminal
						</span>
						<div className="flex-1" />
						<span className="text-muted-foreground/20 text-[10px]">□</span>
						<LuX className="size-3 text-muted-foreground/20" />
					</div>

					{/* Terminal content */}
					<div className="flex-1 bg-black/30 backdrop-blur-sm p-3 font-mono text-[10px] leading-relaxed overflow-hidden relative">
						{/* Default terminal content */}
						<motion.div
							initial={{ opacity: 1 }}
							animate={{
								opacity: activeDemo === "Create Parallel Branches" ? 0 : 1,
							}}
							transition={{ duration: 0.2, ease: "easeOut" }}
						>
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
							<div className="border-t border-white/[0.04] pt-3 space-y-2">
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
						</motion.div>

						{/* Create Parallel Branches overlay */}
						<motion.div
							className="absolute inset-0 p-3 font-mono text-[10px] leading-relaxed"
							initial={{ opacity: 0 }}
							animate={{
								opacity: activeDemo === "Create Parallel Branches" ? 1 : 0,
							}}
							transition={{ duration: 0.3, ease: "easeOut" }}
							style={{
								pointerEvents:
									activeDemo === "Create Parallel Branches" ? "auto" : "none",
							}}
						>
							<div className="text-foreground mb-3">
								<span className="text-muted-foreground/60">❯</span>{" "}
								<span className="text-cyan-400">superset new</span>
							</div>
							<div className="space-y-1.5 text-muted-foreground/70">
								<div className="flex items-center gap-2">
									<AsciiSpinner className="text-[10px]" />
									<span>Setting up new parallel environment...</span>
								</div>
								<div className="ml-5 text-muted-foreground/50">
									→ Creating worktree from main
								</div>
								<div className="ml-5 text-muted-foreground/50">
									→ Installing dependencies
								</div>
								<div className="ml-5 text-muted-foreground/50">
									→ Configuring environment
								</div>
							</div>
						</motion.div>
					</div>
				</div>

				{/* Right sidebar */}
				<motion.div
					className="bg-white/[0.02] backdrop-blur-lg border-l border-white/[0.06] flex flex-col shrink-0 relative overflow-hidden"
					initial={{ width: 200 }}
					animate={{
						width: activeDemo === "See Changes" ? 350 : 200,
					}}
					transition={{ duration: 0.3, ease: "easeOut" }}
				>
					{/* Default view - Header, Commit & Push, File changes */}
					<motion.div
						className="absolute inset-0 flex flex-col"
						initial={{ opacity: 1 }}
						animate={{
							opacity: activeDemo === "See Changes" ? 0 : 1,
						}}
						transition={{ duration: 0.2, ease: "easeOut" }}
						style={{
							pointerEvents: activeDemo === "See Changes" ? "none" : "auto",
						}}
					>
						{/* Header */}
						<div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
							<span className="text-[10px] text-foreground/70">
								Review Changes
							</span>
							<div className="flex items-center gap-1 text-[10px]">
								<LuGitPullRequest className="size-3.5 text-cyan-400/70" />
								<span className="text-muted-foreground/60">#827</span>
							</div>
						</div>

						{/* Commit & Push section */}
						<div className="px-3 py-2 border-b border-white/[0.06] space-y-2">
							<div className="h-7 bg-black/20 rounded border border-white/[0.06] px-2 flex items-center text-[10px] text-muted-foreground/30">
								Commit message...
							</div>
							<button
								type="button"
								className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-[10px] bg-white/[0.06] hover:bg-white/[0.1] rounded text-foreground/80"
							>
								<span>↑</span>
								<span>Push</span>
								<span className="text-muted-foreground/50">26</span>
							</button>
						</div>

						{/* File changes list */}
						<motion.div
							className="flex-1 overflow-hidden"
							initial={{ opacity: 1 }}
							animate={{
								opacity: activeDemo === "Create Parallel Branches" ? 0 : 1,
							}}
							transition={{ duration: 0.3, ease: "easeOut" }}
						>
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
						</motion.div>
					</motion.div>

					{/* Diff review view - shown when "See Changes" is active */}
					<motion.div
						className="absolute inset-0 flex flex-col bg-black/30 backdrop-blur-md"
						initial={{ opacity: 0 }}
						animate={{
							opacity: activeDemo === "See Changes" ? 1 : 0,
						}}
						transition={{
							duration: 0.3,
							ease: "easeOut",
							delay: activeDemo === "See Changes" ? 0.1 : 0,
						}}
						style={{
							pointerEvents: activeDemo === "See Changes" ? "auto" : "none",
						}}
					>
						{/* PR Header */}
						<div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
							<div className="flex items-center gap-2">
								<LuGitPullRequest className="size-4 text-emerald-400/80" />
								<span className="text-sm text-foreground/80 font-medium">
									Review PR #827
								</span>
							</div>
							<span className="text-xs text-emerald-400/80 px-2 py-0.5 bg-emerald-500/[0.08] rounded">
								Open
							</span>
						</div>

						{/* File tabs */}
						<div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.06] text-xs">
							<span className="px-2 py-1 bg-white/[0.06] rounded text-foreground/70">
								cloud-workspace.ts
							</span>
							<span className="px-2 py-1 text-muted-foreground/50">
								enums.ts
							</span>
							<span className="px-2 py-1 text-muted-foreground/50">
								+4 more
							</span>
						</div>

						{/* Diff content */}
						<div className="flex-1 overflow-hidden p-3 font-mono text-[10px]">
							<div className="space-y-0.5">
								<div className="text-muted-foreground/40 py-1">
									@@ -1,4 +1,6 @@
								</div>
								<div className="flex">
									<span className="w-6 text-muted-foreground/25 shrink-0">
										1
									</span>
									<span className="text-muted-foreground/60">
										import {"{"} db {"}"} from "../db"
									</span>
								</div>
								<div className="flex bg-emerald-500/[0.08]">
									<span className="w-6 text-emerald-400/80 shrink-0">+</span>
									<span className="text-emerald-400/80">
										import {"{"} CloudWorkspace {"}"} from "./types"
									</span>
								</div>
								<div className="flex bg-emerald-500/[0.08]">
									<span className="w-6 text-emerald-400/80 shrink-0">+</span>
									<span className="text-emerald-400/80">
										import {"{"} createSSHConnection {"}"} from "./ssh"
									</span>
								</div>
								<div className="flex">
									<span className="w-6 text-muted-foreground/25 shrink-0">
										2
									</span>
									<span className="text-muted-foreground/60"></span>
								</div>
								<div className="flex bg-red-500/[0.08]">
									<span className="w-6 text-red-400/80 shrink-0">-</span>
									<span className="text-red-400/80">
										export const getWorkspaces = () ={">"} {"{"}
									</span>
								</div>
								<div className="flex bg-emerald-500/[0.08]">
									<span className="w-6 text-emerald-400/80 shrink-0">+</span>
									<span className="text-emerald-400/80">
										export const getWorkspaces = async () ={">"} {"{"}
									</span>
								</div>
								<div className="flex">
									<span className="w-6 text-muted-foreground/25 shrink-0">
										4
									</span>
									<span className="text-muted-foreground/60">
										{"  "}return db.query.workspaces
									</span>
								</div>
							</div>
						</div>

						{/* Review actions */}
						<div className="px-3 py-2 border-t border-white/[0.06] flex items-center gap-2">
							<button
								type="button"
								className="px-3 py-1.5 text-xs bg-emerald-500/[0.12] text-emerald-400/80 rounded hover:bg-emerald-500/20"
							>
								Approve
							</button>
							<button
								type="button"
								className="px-3 py-1.5 text-xs bg-white/[0.06] text-foreground/60 rounded hover:bg-white/[0.1]"
							>
								Comment
							</button>
						</div>
					</motion.div>
				</motion.div>
			</div>

			{/* External IDE Popup - shown when "Open in Any IDE" is active */}
			<motion.div
				className="absolute bottom-6 right-6 w-[55%] rounded-xl overflow-hidden bg-black/50 backdrop-blur-xl border border-white/[0.1] shadow-2xl"
				style={{ aspectRatio: "16/10" }}
				initial={{ opacity: 0, scale: 0.9, y: 20 }}
				animate={{
					opacity: activeDemo === "Open in Any IDE" ? 1 : 0,
					scale: activeDemo === "Open in Any IDE" ? 1 : 0.9,
					y: activeDemo === "Open in Any IDE" ? 0 : 20,
				}}
				transition={{ duration: 0.3, ease: "easeOut" }}
			>
				{/* IDE window chrome */}
				<div className="flex items-center justify-between px-3 py-2 bg-white/[0.04] backdrop-blur-md border-b border-white/[0.06]">
					<div className="flex items-center gap-1.5">
						<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/80" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/80" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/80" />
					</div>
					<span className="text-sm text-muted-foreground/60">External IDE</span>
					<div className="w-12" />
				</div>

				<div className="flex h-[calc(100%-36px)]">
					{/* File tree */}
					<div className="w-[110px] bg-white/[0.02] border-r border-white/[0.06] p-3 text-sm">
						<div className="flex items-center gap-2 text-muted-foreground/60 mb-2">
							<LuFolder className="size-4" />
							<span>src</span>
						</div>
						<div className="ml-4 space-y-1.5">
							<div className="flex items-center gap-2 text-cyan-400/80">
								<LuFile className="size-4" />
								<span>index.ts</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground/50">
								<LuFile className="size-4" />
								<span>utils.ts</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground/50">
								<LuFile className="size-4" />
								<span>types.ts</span>
							</div>
						</div>
					</div>

					{/* Code editor */}
					<div className="flex-1 bg-black/20 p-4 text-sm font-mono overflow-hidden">
						<div className="space-y-1.5 leading-relaxed">
							<div>
								<span className="text-purple-400/80">import</span> {"{"} Agent{" "}
								{"}"} <span className="text-purple-400/80">from</span>{" "}
								<span className="text-amber-300/80">"ai"</span>
							</div>
							<div>
								<span className="text-purple-400/80">import</span> {"{"} tools{" "}
								{"}"} <span className="text-purple-400/80">from</span>{" "}
								<span className="text-amber-300/80">"./utils"</span>
							</div>
							<div className="text-muted-foreground/20">│</div>
							<div>
								<span className="text-purple-400/80">const</span>{" "}
								<span className="text-cyan-400/80">agent</span> ={" "}
								<span className="text-amber-400/80">new</span> Agent({"{"}
							</div>
							<div className="pl-4">
								<span className="text-foreground/60">model:</span>{" "}
								<span className="text-amber-300/80">"claude-4"</span>,
							</div>
							<div className="pl-4">
								<span className="text-foreground/60">tools:</span> [tools.read,
								tools.write]
							</div>
							<div>{"}"})</div>
						</div>
					</div>
				</div>
			</motion.div>
		</div>
	);
}
