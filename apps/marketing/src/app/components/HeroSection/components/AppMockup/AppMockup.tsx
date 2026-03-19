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
		<span className="relative flex size-1.5 shrink-0">
			{config.pulse && (
				<span
					className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.ping}`}
				/>
			)}
			<span
				className={`relative inline-flex size-1.5 rounded-full ${config.dot}`}
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
			className={`relative flex cursor-pointer items-start gap-2.5 px-2.5 py-1.5 text-xs ${isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"}`}
		>
			{isActive && (
				<div className="absolute left-0 top-0 bottom-0 w-0.5 bg-cyan-500 rounded-r" />
			)}
			<div className="relative mt-0.5 text-muted-foreground/30">
				{status === "working" ? (
					<AsciiSpinner className="text-xs" />
				) : (
					<LuFolderGit2 className="size-4" />
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
						className={`truncate ${isActive ? "text-foreground font-medium" : "text-foreground/60"}`}
					>
						{name}
					</span>
					{(add !== undefined || pr) && (
						<div className="flex items-center gap-1 shrink-0">
							{add !== undefined && (
								<span className="text-[11px]">
									<span className="text-emerald-400/80">+{add}</span>
									{del !== undefined && del > 0 && (
										<span className="ml-0.5 text-red-400/80">-{del}</span>
									)}
								</span>
							)}
						</div>
					)}
				</div>
				<div className="flex items-center justify-between">
					<span className="truncate font-mono text-[11px] text-muted-foreground/30">
						{branch}
					</span>
					{pr && (
						<span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/20">
							<LuGitPullRequest className="size-3" />
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
			? "text-emerald-400/75"
			: type === "edit"
				? "text-amber-400/70"
				: "text-muted-foreground/30";

	const isFolder = type === "folder";

	return (
		<div
			className={`flex items-center justify-between gap-2 px-3 hover:bg-white/[0.03] ${isFolder ? "mt-1 py-1.5" : "py-1"}`}
			style={{ paddingLeft: `${12 + (indent || 0) * 16}px` }}
		>
			<div className="flex items-center gap-2 min-w-0">
				<Icon className={`size-3.5 shrink-0 ${iconColor}`} />
				<span
					className={`truncate ${isFolder ? "text-[11px] text-muted-foreground/40" : "text-xs text-muted-foreground/60"}`}
				>
					{path}
				</span>
			</div>
			{!isFolder && (add > 0 || del > 0) && (
				<span className="shrink-0 tabular-nums text-[11px]">
					{add > 0 && <span className="text-emerald-400/80">+{add}</span>}
					{del > 0 && <span className="ml-1 text-red-400/80">-{del}</span>}
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
	return (
		<div
			className="relative w-full min-w-[700px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0b0c] shadow-[0_32px_80px_-36px_rgba(0,0,0,0.9)]"
			style={{ aspectRatio: "16/10" }}
		>
			{/* Window chrome */}
			<div className="flex items-center justify-between border-b border-white/[0.05] bg-[#111113] px-4 py-2.5">
				<div className="flex items-center gap-1.5">
					<div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
					<div className="w-3 h-3 rounded-full bg-[#febc2e]" />
					<div className="w-3 h-3 rounded-full bg-[#28c840]" />
				</div>
				<span className="text-[13px] text-muted-foreground/70">superset</span>
				<div className="w-12" />
			</div>

			<div className="flex h-[calc(100%-40px)]">
				{/* Left sidebar */}
				<div className="flex w-[210px] shrink-0 flex-col border-r border-white/[0.05] bg-[#0f0f11]">
					{/* New Workspace button */}
					<div className="border-b border-white/[0.05] px-2.5 py-2.5">
						<button
							type="button"
							className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground/40 hover:bg-white/[0.025] hover:text-muted-foreground/60"
						>
							<LuPlus className="size-4" />
							<span>New Workspace</span>
						</button>
					</div>

					{/* Repository section */}
					<div className="flex cursor-pointer items-center justify-between border-b border-white/[0.05] px-2.5 py-2 hover:bg-white/[0.02]">
						<div className="flex items-center gap-2">
							<span className="text-[13px] text-foreground/70">superset</span>
							<span className="text-xs text-muted-foreground/30">(5)</span>
						</div>
						<div className="flex items-center gap-1 text-muted-foreground/30">
							<LuPlus className="size-3.5" />
							<LuChevronDown className="size-3.5" />
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
							<div className="flex items-start gap-2.5 px-2.5 py-1.5 text-xs bg-cyan-500/10 border-l-2 border-cyan-500 relative">
								<div className="mt-0.5 text-muted-foreground/50 relative">
									<AsciiSpinner className="text-xs" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between gap-1">
										<span className="truncate text-foreground font-medium">
											new workspace
										</span>
									</div>
									<span className="text-muted-foreground/50 truncate text-[11px] font-mono">
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
					<div className="mb-2 border-t border-white/[0.05]">
						<div className="flex items-center justify-between px-2.5 py-2">
							<div className="flex items-center gap-1 text-xs text-muted-foreground/40">
								<span>⌥</span>
								<span>Ports</span>
							</div>
							<span className="text-[11px] text-muted-foreground/30">4</span>
						</div>
						{PORTS.map((port) => (
							<div key={port.workspace} className="px-2.5 py-1">
								<div className="flex items-center justify-between text-[11px]">
									<span className="truncate text-muted-foreground/30">
										{port.workspace}
									</span>
									<LuX className="size-3 text-muted-foreground/20" />
								</div>
								<div className="flex flex-wrap gap-1 mt-0.5">
									{port.ports.map((p) => (
										<span
											key={p}
											className="rounded bg-white/[0.03] px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground/40"
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
				<div className="flex min-w-0 flex-1 flex-col">
					{/* Tab bar */}
					<div className="flex items-center gap-0.5 border-b border-white/[0.05] bg-[#101012] px-2 py-1.5">
						{/* Claude tab - always visible, active */}
						<div className="flex items-center gap-1.5 rounded-t border-b-2 border-cyan-500/70 bg-white/[0.05] px-3 py-1 text-xs text-foreground/90">
							{activeDemo === "Create Parallel Branches" ? (
								<>
									<LuTerminal className="size-3.5 text-muted-foreground/70" />
									<span>setup</span>
								</>
							) : (
								<>
									<Image
										src="/app-icons/claude.svg"
										alt="Claude"
										width={14}
										height={14}
									/>
									<span>claude</span>
								</>
							)}
							<LuX className="size-3.5 text-muted-foreground/30 hover:text-muted-foreground/50" />
						</div>
						{/* Other agent tabs - shown when "Use Any Agents" is active */}
						<motion.div
							className="flex items-center gap-1.5 overflow-hidden rounded-t py-1 text-xs text-muted-foreground/40 hover:bg-white/[0.03]"
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
								width={14}
								height={14}
							/>
							<span>codex</span>
							<LuX className="size-3.5 text-muted-foreground/20" />
						</motion.div>
						<motion.div
							className="flex items-center gap-1.5 overflow-hidden rounded-t py-1 text-xs text-muted-foreground/40 hover:bg-white/[0.03]"
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
								width={14}
								height={14}
							/>
							<span>gemini</span>
							<LuX className="size-3.5 text-muted-foreground/20" />
						</motion.div>
						<motion.div
							className="flex items-center gap-1.5 overflow-hidden rounded-t py-1 text-xs text-muted-foreground/40 hover:bg-white/[0.03]"
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
								width={14}
								height={14}
							/>
							<span>cursor</span>
							<LuX className="size-3.5 text-muted-foreground/20" />
						</motion.div>
						<div className="flex cursor-pointer items-center px-2 py-1 text-muted-foreground/20 hover:text-muted-foreground/40">
							<LuPlus className="size-4" />
							<LuChevronDown className="size-3.5 ml-0.5" />
						</div>
					</div>

					{/* Terminal header */}
					<div className="flex items-center gap-2 border-b border-white/[0.04] bg-[#0e0e10] px-4 py-2">
						<span className="text-muted-foreground/40 text-xs">⬛</span>
						<span className="text-xs text-muted-foreground/40">Terminal</span>
						<div className="flex-1" />
						<span className="text-muted-foreground/20 text-xs">□</span>
						<LuX className="size-3.5 text-muted-foreground/20" />
					</div>

					{/* Terminal content */}
					<div className="relative flex-1 overflow-hidden bg-[#09090a] p-4 font-mono text-xs leading-relaxed">
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
								<div className="text-cyan-400 leading-none whitespace-pre text-[11px]">
									{`  * ▐▛███▜▌ *
 * ▝▜█████▛▘ *
  *  ▘▘ ▝▝  *`}
								</div>
								<div className="text-muted-foreground/90 text-xs">
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
							className="absolute inset-0 p-4 font-mono text-xs leading-relaxed"
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
									<AsciiSpinner className="text-xs" />
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
					className="relative flex shrink-0 flex-col overflow-hidden border-l border-white/[0.05] bg-[#0f0f10]"
					initial={{ width: 230 }}
					animate={{
						width: activeDemo === "See Changes" ? 380 : 230,
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
						<div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-2.5">
							<span className="text-xs text-foreground/60">Review Changes</span>
							<div className="flex items-center gap-1 text-xs">
								<LuGitPullRequest className="size-4 text-cyan-400/70" />
								<span className="text-muted-foreground/40">#827</span>
							</div>
						</div>

						{/* Commit & Push section */}
						<div className="space-y-2 border-b border-white/[0.05] px-3 py-2.5">
							<div className="h-8 bg-black/20 rounded border border-white/[0.06] px-2.5 flex items-center text-xs text-muted-foreground/30">
								Commit message...
							</div>
							<button
								type="button"
								className="flex w-full items-center justify-center gap-2 rounded bg-white/[0.04] px-3 py-1.5 text-xs text-foreground/70 hover:bg-white/[0.07]"
							>
								<span>↑</span>
								<span>Push</span>
								<span className="text-muted-foreground/30">26</span>
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
						className="absolute inset-0 flex flex-col bg-[#0a0a0b]"
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
						<div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-2.5">
							<div className="flex items-center gap-2">
								<LuGitPullRequest className="size-4.5 text-emerald-400/80" />
								<span className="text-sm font-medium text-foreground/70">
									Review PR #827
								</span>
							</div>
							<span className="text-xs text-emerald-400/80 px-2 py-0.5 bg-emerald-500/[0.08] rounded">
								Open
							</span>
						</div>

						{/* File tabs */}
						<div className="flex items-center gap-1 border-b border-white/[0.05] px-3 py-2 text-xs">
							<span className="rounded bg-white/[0.04] px-2 py-1 text-foreground/60">
								cloud-workspace.ts
							</span>
							<span className="px-2 py-1 text-muted-foreground/30">
								enums.ts
							</span>
							<span className="px-2 py-1 text-muted-foreground/30">
								+4 more
							</span>
						</div>

						{/* Diff content */}
						<div className="flex-1 overflow-hidden p-3 font-mono text-xs">
							<div className="space-y-0.5">
								<div className="text-muted-foreground/40 py-1">
									@@ -1,4 +1,6 @@
								</div>
								<div className="flex">
									<span className="w-7 text-muted-foreground/25 shrink-0">
										1
									</span>
									<span className="text-muted-foreground/60">
										import {"{"} db {"}"} from "../db"
									</span>
								</div>
								<div className="flex bg-emerald-500/[0.08]">
									<span className="w-7 text-emerald-400/80 shrink-0">+</span>
									<span className="text-emerald-400/80">
										import {"{"} CloudWorkspace {"}"} from "./types"
									</span>
								</div>
								<div className="flex bg-emerald-500/[0.08]">
									<span className="w-7 text-emerald-400/80 shrink-0">+</span>
									<span className="text-emerald-400/80">
										import {"{"} createSSHConnection {"}"} from "./ssh"
									</span>
								</div>
								<div className="flex">
									<span className="w-7 text-muted-foreground/25 shrink-0">
										2
									</span>
									<span className="text-muted-foreground/60"></span>
								</div>
								<div className="flex bg-red-500/[0.08]">
									<span className="w-7 text-red-400/80 shrink-0">-</span>
									<span className="text-red-400/80">
										export const getWorkspaces = () ={">"} {"{"}
									</span>
								</div>
								<div className="flex bg-emerald-500/[0.08]">
									<span className="w-7 text-emerald-400/80 shrink-0">+</span>
									<span className="text-emerald-400/80">
										export const getWorkspaces = async () ={">"} {"{"}
									</span>
								</div>
								<div className="flex">
									<span className="w-7 text-muted-foreground/25 shrink-0">
										4
									</span>
									<span className="text-muted-foreground/60">
										{"  "}return db.query.workspaces
									</span>
								</div>
							</div>
						</div>

						{/* Review actions */}
						<div className="flex items-center gap-2 border-t border-white/[0.05] px-3 py-2.5">
							<button
								type="button"
								className="px-3 py-1.5 text-xs bg-emerald-500/[0.12] text-emerald-400/80 rounded hover:bg-emerald-500/20"
							>
								Approve
							</button>
							<button
								type="button"
								className="rounded bg-white/[0.04] px-3 py-1.5 text-xs text-foreground/50 hover:bg-white/[0.07]"
							>
								Comment
							</button>
						</div>
					</motion.div>
				</motion.div>
			</div>

			{/* External IDE Popup - shown when "Open in Any IDE" is active */}
			<motion.div
				className="absolute bottom-6 right-6 w-[55%] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0d0f] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.9)]"
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
				<div className="flex items-center justify-between border-b border-white/[0.05] bg-[#111113] px-3 py-2">
					<div className="flex items-center gap-1.5">
						<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/80" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/80" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/80" />
					</div>
					<span className="text-sm text-muted-foreground/40">External IDE</span>
					<div className="w-12" />
				</div>

				<div className="flex h-[calc(100%-36px)]">
					{/* File tree */}
					<div className="w-[110px] border-r border-white/[0.05] bg-[#101012] p-3 text-sm">
						<div className="mb-2 flex items-center gap-2 text-muted-foreground/40">
							<LuFolder className="size-4" />
							<span>src</span>
						</div>
						<div className="ml-4 space-y-1.5">
							<div className="flex items-center gap-2 text-cyan-400/80">
								<LuFile className="size-4" />
								<span>index.ts</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground/30">
								<LuFile className="size-4" />
								<span>utils.ts</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground/30">
								<LuFile className="size-4" />
								<span>types.ts</span>
							</div>
						</div>
					</div>

					{/* Code editor */}
					<div className="flex-1 overflow-hidden bg-[#0a0a0c] p-4 text-sm font-mono">
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
