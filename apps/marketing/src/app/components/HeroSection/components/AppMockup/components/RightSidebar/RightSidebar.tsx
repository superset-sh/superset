"use client";

import { motion } from "framer-motion";
import { LuArrowRight, LuGitPullRequest } from "react-icons/lu";
import { FILE_CHANGES } from "../../constants";
import type { ActiveDemo } from "../../types";
import { FileChangeItem } from "../FileChangeItem";

interface RightSidebarProps {
	activeDemo: ActiveDemo;
}

const TABS = ["Files", "Changes", "Review"] as const;

const BRANCH_BY_DEMO: Record<ActiveDemo, string> = {
	"Use Any Agents": "use-any-agents",
	"Create Parallel Branches": "create-parallel-branches",
	"See Changes": "see-changes",
	"Open in Any IDE": "open-in-any-ide",
};

export function RightSidebar({ activeDemo }: RightSidebarProps) {
	const isDiff = activeDemo === "See Changes";

	return (
		<motion.div
			className="relative flex shrink-0 flex-col overflow-hidden border-l border-border bg-card text-[11px]"
			initial={{ width: 236 }}
			animate={{ width: isDiff ? 380 : 236 }}
			transition={{ duration: 0.3, ease: "easeOut" }}
		>
			<div className="flex h-9 items-center justify-end border-b border-border px-3">
				<button
					type="button"
					className="flex h-6 items-center gap-1.5 border border-border bg-background px-2 text-[10px] font-medium uppercase tracking-[0.06em] text-foreground/85 hover:bg-foreground/[0.04]"
				>
					<LuGitPullRequest className="size-2.5 text-brand-light" />
					<span>PR</span>
					<span className="font-mono tabular-nums text-muted-foreground/55">
						#827
					</span>
				</button>
			</div>

			<div className="flex h-8 items-center gap-3 border-b border-border px-3">
				{TABS.map((tab) => {
					const active = isDiff ? tab === "Changes" : tab === "Files";
					return (
						<div
							key={tab}
							className={`relative flex h-8 cursor-pointer items-center text-[11px] font-medium ${
								active
									? "text-foreground/95"
									: "text-muted-foreground/55 hover:text-foreground/85"
							}`}
						>
							{tab}
							{active && (
								<span className="absolute inset-x-0 -bottom-px h-[2px] bg-brand" />
							)}
						</div>
					);
				})}
			</div>

			<div className="border-b border-border px-3 py-2.5">
				<div className="flex items-center gap-2 font-mono text-[11px]">
					<span className="size-1.5 rounded-full bg-brand" />
					<span className="truncate font-medium text-foreground/95">
						{BRANCH_BY_DEMO[activeDemo]}
					</span>
				</div>
				<div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/60">
					<span className="tabular-nums text-emerald-400/85">+1,128</span>
					<span className="tabular-nums text-rose-400/75">−98</span>
					<span className="text-muted-foreground/45">·</span>
					<span>10 files</span>
					<span className="text-muted-foreground/45">·</span>
					<span className="flex items-center gap-1">
						<LuArrowRight className="size-2.5" />
						main
					</span>
				</div>
			</div>

			<div className="relative flex-1">
				<motion.div
					className="absolute inset-0 flex flex-col"
					initial={{ opacity: 1 }}
					animate={{ opacity: isDiff ? 0 : 1 }}
					transition={{ duration: 0.2 }}
					style={{ pointerEvents: isDiff ? "none" : "auto" }}
				>
					<div className="flex-1 space-y-0.5 overflow-hidden py-1.5">
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
					</div>
				</motion.div>

				<motion.div
					className="absolute inset-0 flex flex-col bg-card"
					initial={{ opacity: 0 }}
					animate={{ opacity: isDiff ? 1 : 0 }}
					transition={{ duration: 0.25, delay: isDiff ? 0.1 : 0 }}
					style={{ pointerEvents: isDiff ? "auto" : "none" }}
				>
					<div className="flex items-center gap-0 border-b border-border px-2">
						<span className="relative flex h-7 items-center px-2 font-mono text-[11px] font-medium text-foreground/95">
							cloud-workspace.ts
							<span className="absolute inset-x-2 -bottom-px h-[2px] bg-brand" />
						</span>
						<span className="flex h-7 items-center px-2 font-mono text-[11px] text-muted-foreground/55">
							enums.ts
						</span>
						<span className="flex h-7 items-center px-2 text-[10px] text-muted-foreground/45">
							+4
						</span>
					</div>

					<div className="flex-1 overflow-hidden p-3 font-mono text-[10px] leading-relaxed">
						<div className="space-y-px">
							<div className="py-0.5 text-muted-foreground/50">
								@@ -1,4 +1,6 @@
							</div>
							<DiffLine n={1}>
								import {"{"} db {"}"} from "../db"
							</DiffLine>
							<DiffLine added>
								import {"{"} CloudWorkspace {"}"} from "./types"
							</DiffLine>
							<DiffLine added>
								import {"{"} createSSHConnection {"}"} from "./ssh"
							</DiffLine>
							<DiffLine n={2} />
							<DiffLine removed>
								export const getWorkspaces = () =&gt; {"{"}
							</DiffLine>
							<DiffLine added>
								export const getWorkspaces = async () =&gt; {"{"}
							</DiffLine>
							<DiffLine n={4}>{"  "}return db.query.workspaces</DiffLine>
						</div>
					</div>

					<div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
						<button
							type="button"
							className="h-7 rounded-sm bg-emerald-500/15 px-2.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25"
						>
							Approve
						</button>
						<button
							type="button"
							className="h-7 rounded-sm border border-border bg-background px-2.5 text-[11px] font-medium text-foreground/80 hover:bg-foreground/[0.04]"
						>
							Comment
						</button>
					</div>
				</motion.div>
			</div>
		</motion.div>
	);
}

function DiffLine({
	n,
	added,
	removed,
	children,
}: {
	n?: number;
	added?: boolean;
	removed?: boolean;
	children?: React.ReactNode;
}) {
	let bg = "";
	let bar = "border-transparent";
	let prefix = "";
	let textColor = "text-muted-foreground/75";

	if (added) {
		bg = "bg-emerald-500/[0.08]";
		bar = "border-emerald-500/85";
		prefix = "+";
		textColor = "text-emerald-300/95";
	} else if (removed) {
		bg = "bg-rose-500/[0.08]";
		bar = "border-rose-500/85";
		prefix = "−";
		textColor = "text-rose-300/95";
	}

	return (
		<div className={`flex border-l-2 ${bar} ${bg}`}>
			<span className="w-6 shrink-0 pr-2 text-right tabular-nums text-muted-foreground/40">
				{prefix || n}
			</span>
			<span className={textColor}>{children}</span>
		</div>
	);
}
