"use client";

import { m } from "framer-motion";
import type { ActiveDemo } from "../../types";
import { AsciiSpinner } from "../AsciiSpinner";

interface RemoteSessionPopupProps {
	activeDemo: ActiveDemo;
}

export function RemoteSessionPopup({ activeDemo }: RemoteSessionPopupProps) {
	const isRemote = activeDemo === "Remote Access";

	return (
		<m.div
			className="absolute bottom-20 right-6 w-[52%] overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_1px_rgba(0,0,0,0.4),0_24px_70px_-16px_rgba(0,0,0,0.75)]"
			style={{
				pointerEvents: isRemote ? "auto" : "none",
			}}
			initial={{ opacity: 0, scale: 0.94, y: 16 }}
			animate={{
				opacity: isRemote ? 1 : 0,
				scale: isRemote ? 1 : 0.94,
				y: isRemote ? 0 : 16,
			}}
			transition={{ duration: 0.3, ease: "easeOut" }}
		>
			<div className="pointer-events-none absolute inset-0 z-10 rounded-lg ring-1 ring-inset ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />

			<div className="relative flex h-8 items-center border-b border-border/60 bg-card px-3">
				<div className="flex items-center gap-1.5">
					<div className="size-2 rounded-full bg-[#ff5f57]/85" />
					<div className="size-2 rounded-full bg-[#febc2e]/85" />
					<div className="size-2 rounded-full bg-[#28c840]/85" />
				</div>
				<span className="pointer-events-none absolute inset-x-0 text-center font-mono text-[10px] tracking-tight text-muted-foreground/60">
					gpu-box (ssh)
				</span>
			</div>

			<div className="space-y-1.5 p-4 font-mono text-[11px] leading-relaxed">
				<div className="text-foreground">
					<span className="text-muted-foreground/55">❯</span>{" "}
					<span className="text-brand-light">ssh gpu-box</span>
				</div>
				<div className="text-muted-foreground/65">
					Welcome to gpu-box · us-east · 64 cores · 128 GB
				</div>
				<div className="pt-2 text-foreground">
					<span className="text-muted-foreground/55">❯</span>{" "}
					<span className="text-brand-light">superset status</span>
				</div>
				<div className="text-muted-foreground">3 workspaces running</div>
				<div className="flex items-center gap-2 text-muted-foreground">
					<AsciiSpinner
						className="text-[10px]"
						toneClassName="text-brand-light"
					/>
					<span>
						nightly evals · claude ·{" "}
						<span className="text-muted-foreground/55">42m</span>
					</span>
				</div>
				<div className="text-muted-foreground">
					<span className="text-emerald-400/85">✓</span> api hotfix ·{" "}
					<span className="text-muted-foreground/55">ready for review</span>
				</div>
				<div className="text-muted-foreground">
					<span className="text-emerald-400/85">✓</span> docs refresh ·{" "}
					<span className="text-muted-foreground/55">PR opened</span>
				</div>
			</div>
		</m.div>
	);
}
