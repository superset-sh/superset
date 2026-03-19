"use client";

import { motion } from "framer-motion";
import { LuGitPullRequest } from "react-icons/lu";
import { FILE_CHANGES } from "../../constants";
import type { ActiveDemo } from "../../types";
import { FileChangeItem } from "../FileChangeItem";

interface RightSidebarProps {
	activeDemo: ActiveDemo;
}

export function RightSidebar({ activeDemo }: RightSidebarProps) {
	return (
		<motion.div
			className="relative flex shrink-0 flex-col overflow-hidden border-l border-white/[0.06] bg-white/[0.02] backdrop-blur-lg"
			initial={{ width: 230 }}
			animate={{
				width: activeDemo === "See Changes" ? 380 : 230,
			}}
			transition={{ duration: 0.3, ease: "easeOut" }}
		>
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
				<div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5 h-12">
					<span className="text-[10px] font-normal tracking-[0.14em] text-foreground/52">
						Review Changes
					</span>
					<div className="flex items-center gap-1 text-[11px]">
						<LuGitPullRequest className="size-4 text-emerald-300/70" />
						<span className="text-muted-foreground/36">#827</span>
					</div>
				</div>

				<div className="space-y-3 border-b border-white/[0.06] px-5 py-3.5">
					<div className="flex h-10 items-center rounded-xs border border-white/[0.06] bg-black/20 px-4 text-[11px] text-muted-foreground/30">
						Commit message...
					</div>
					<button
						type="button"
						className="flex w-full items-center justify-center gap-2 rounded-xs border border-white/[0.06] bg-white/[0.04] px-4 py-2.5 text-[11px] font-medium text-foreground/70 hover:bg-white/[0.07]"
					>
						<span>↑</span>
						<span>Push</span>
						<span className="text-[10px] text-muted-foreground/30">26</span>
					</button>
				</div>

				<motion.div
					className="flex-1 overflow-hidden"
					initial={{ opacity: 1 }}
					animate={{
						opacity: activeDemo === "Create Parallel Branches" ? 0 : 1,
					}}
					transition={{ duration: 0.3, ease: "easeOut" }}
				>
					{FILE_CHANGES.map((file, index) => (
						<FileChangeItem
							key={`${file.path}-${index}`}
							path={file.path}
							add={file.add}
							del={file.del}
							indent={file.indent}
							type={file.type}
						/>
					))}
				</motion.div>
			</motion.div>

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
				<div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
					<div className="flex items-center gap-2">
						<LuGitPullRequest className="size-4.5 text-emerald-300/75" />
						<span className="text-[13px] font-medium text-foreground/72">
							Review PR #827
						</span>
					</div>
					<span className="rounded-xs border border-orange-500/[0.10] bg-orange-500/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-orange-500/75">
						Open
					</span>
				</div>

				<div className="flex items-center gap-1.5 border-b border-white/[0.06] px-5 py-3 text-[11px]">
					<span className="rounded-xs border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 font-medium text-foreground/64">
						cloud-workspace.ts
					</span>
					<span className="px-3 py-1.5 text-muted-foreground/30">enums.ts</span>
					<span className="px-3 py-1.5 text-muted-foreground/30">+4 more</span>
				</div>

				<div className="flex-1 overflow-hidden p-5 font-mono text-[11px]">
					<div className="space-y-1">
						<div className="py-1 text-muted-foreground/40">@@ -1,4 +1,6 @@</div>
						<div className="flex">
							<span className="w-7 shrink-0 text-muted-foreground/25">1</span>
							<span className="text-muted-foreground/60">
								import {"{"} db {"}"} from "../db"
							</span>
						</div>
						<div className="flex bg-emerald-300/[0.08]">
							<span className="w-7 shrink-0 text-emerald-300/75">+</span>
							<span className="text-emerald-300/75">
								import {"{"} CloudWorkspace {"}"} from "./types"
							</span>
						</div>
						<div className="flex bg-emerald-300/[0.08]">
							<span className="w-7 shrink-0 text-emerald-300/75">+</span>
							<span className="text-emerald-300/75">
								import {"{"} createSSHConnection {"}"} from "./ssh"
							</span>
						</div>
						<div className="flex">
							<span className="w-7 shrink-0 text-muted-foreground/25">2</span>
							<span className="text-muted-foreground/60"></span>
						</div>
						<div className="flex bg-rose-300/[0.08]">
							<span className="w-7 shrink-0 text-rose-300/75">-</span>
							<span className="text-rose-300/75">
								export const getWorkspaces = () ={">"} {"{"}
							</span>
						</div>
						<div className="flex bg-emerald-300/[0.08]">
							<span className="w-7 shrink-0 text-emerald-300/75">+</span>
							<span className="text-emerald-300/75">
								export const getWorkspaces = async () ={">"} {"{"}
							</span>
						</div>
						<div className="flex">
							<span className="w-7 shrink-0 text-muted-foreground/25">4</span>
							<span className="text-muted-foreground/60">
								{"  "}return db.query.workspaces
							</span>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-3 border-t border-white/[0.06] px-5 py-3.5">
					<button
						type="button"
						className="rounded-xs border border-emerald-300/[0.10] bg-emerald-300/[0.10] px-4 py-2 text-[11px] font-medium text-emerald-300/75 hover:bg-emerald-300/[0.16]"
					>
						Approve
					</button>
					<button
						type="button"
						className="rounded-xs border border-white/[0.06] bg-white/[0.04] px-4 py-2 text-[11px] font-medium text-foreground/50 hover:bg-white/[0.07]"
					>
						Comment
					</button>
				</div>
			</motion.div>
		</motion.div>
	);
}
