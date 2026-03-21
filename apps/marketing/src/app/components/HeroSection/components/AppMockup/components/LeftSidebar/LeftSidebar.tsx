"use client";

import { motion } from "framer-motion";
import { LuChevronDown, LuPlus, LuX } from "react-icons/lu";
import { PORTS, WORKSPACES } from "../../constants";
import type { ActiveDemo } from "../../types";
import { AsciiSpinner } from "../AsciiSpinner";
import { WorkspaceItem } from "../WorkspaceItem";

interface LeftSidebarProps {
	activeDemo: ActiveDemo;
}

export function LeftSidebar({ activeDemo }: LeftSidebarProps) {
	return (
		<div className="flex w-[210px] shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.02] backdrop-blur-lg">
			<div className="border-b border-white/[0.06] h-12">
				<button
					type="button"
					className="flex w-full cursor-pointer items-center gap-2.5 px-4 text-[11px] text-muted-foreground/42 hover:bg-white/[0.025] hover:text-muted-foreground/60 size-full"
				>
					<LuPlus className="size-4" />
					<span>New Workspace</span>
				</button>
			</div>

			<div className="flex cursor-pointer items-center justify-between border-b border-white/[0.06] px-4 py-3 hover:bg-white/[0.04]">
				<div className="flex items-center gap-2">
					<span className="text-[12px] font-medium text-foreground/72">
						superset
					</span>
					<span className="text-[10px] text-muted-foreground/28">(5)</span>
				</div>
				<div className="flex items-center gap-1 text-muted-foreground/30">
					<LuPlus className="size-3.5" />
					<LuChevronDown className="size-3.5" />
				</div>
			</div>

			<div className="flex-1 overflow-hidden">
				<motion.div
					className="overflow-hidden"
					initial={{ height: 0, opacity: 0 }}
					animate={{
						height: activeDemo === "Create Parallel Branches" ? "auto" : 0,
						opacity: activeDemo === "Create Parallel Branches" ? 1 : 0,
					}}
					transition={{ duration: 0.3, ease: "easeOut" }}
				>
					<div className="relative flex items-start gap-3.5 border-l-2 border-orange-500/70 bg-orange-500/[0.08] px-4 py-2.5 text-[11px]">
						<div className="relative mt-0.5 text-muted-foreground/50">
							<AsciiSpinner className="text-[11px]" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between gap-1">
								<span className="truncate font-medium text-foreground">
									new workspace
								</span>
							</div>
							<span className="truncate font-mono text-[10px] text-muted-foreground/42">
								creating...
							</span>
						</div>
					</div>
				</motion.div>

				{WORKSPACES.map((workspace) => {
					const isFirstItem = workspace.name === "use any agents";
					const shouldHideActiveState =
						isFirstItem && activeDemo === "Create Parallel Branches";

					return (
						<WorkspaceItem
							key={workspace.branch}
							name={workspace.name}
							branch={workspace.branch}
							add={workspace.add}
							del={workspace.del}
							pr={workspace.pr}
							isActive={shouldHideActiveState ? false : workspace.isActive}
							status={shouldHideActiveState ? undefined : workspace.status}
						/>
					);
				})}
			</div>

			<div className="mb-2 border-t border-white/[0.06]">
				<div className="flex items-center justify-between px-4 py-3">
					<div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/36">
						<span>⌥</span>
						<span>Ports</span>
					</div>
					<span className="text-[10px] text-muted-foreground/28">4</span>
				</div>
				{PORTS.map((port) => (
					<div key={port.workspace} className="px-4 py-2">
						<div className="flex items-center justify-between text-[10px]">
							<span className="truncate text-muted-foreground/30">
								{port.workspace}
							</span>
							<LuX className="size-3 text-muted-foreground/20" />
						</div>
						<div className="mt-1 flex flex-wrap gap-1.5">
							{port.ports.map((value) => (
								<span
									key={value}
									className="rounded-xs border border-white/[0.05] bg-white/[0.02] px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground/40"
								>
									{value}
								</span>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
