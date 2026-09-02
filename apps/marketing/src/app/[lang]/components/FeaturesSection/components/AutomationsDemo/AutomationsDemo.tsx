"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { m, useInView } from "framer-motion";
import { useRef } from "react";

const AUTOMATIONS: {
	name: string;
	schedule: MessageDescriptor;
	lastRun: MessageDescriptor;
	running?: boolean;
}[] = [
	{
		name: "daily-triage",
		schedule: msg({
			id: "marketing.features.automations.schedule.daily",
			message: "daily 9:00",
		}),
		lastRun: msg({
			id: "marketing.features.automations.lastRun.running",
			message: "running",
		}),
		running: true,
	},
	{
		name: "changelog-draft",
		schedule: msg({
			id: "marketing.features.automations.schedule.sunday",
			message: "sun 11:00",
		}),
		lastRun: msg({
			id: "marketing.features.automations.lastRun.twoHoursAgo",
			message: "2h ago",
		}),
	},
	{
		name: "dep-upgrades",
		schedule: msg({
			id: "marketing.features.automations.schedule.weekly",
			message: "weekly",
		}),
		lastRun: msg({
			id: "marketing.features.automations.lastRun.oneDayAgo",
			message: "1d ago",
		}),
	},
	{
		name: "roadmap-sync",
		schedule: msg({
			id: "marketing.features.automations.schedule.monthly",
			message: "monthly",
		}),
		lastRun: msg({
			id: "marketing.features.automations.lastRun.threeDaysAgo",
			message: "3d ago",
		}),
	},
];

const LOG_LINES: { id: string; message: MessageDescriptor }[] = [
	{
		id: "triaging",
		message: msg({
			id: "marketing.features.automations.log.triaging",
			message: "triaging 12 new issues…",
		}),
	},
	{
		id: "drafted",
		message: msg({
			id: "marketing.features.automations.log.drafted",
			message: "drafted 3 support replies",
		}),
	},
	{
		id: "opened-pr",
		message: msg({
			id: "marketing.features.automations.log.openedPr",
			message: "opened PR #841 for review",
		}),
	},
];

export function AutomationsDemo() {
	const { t } = useLingui();
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<m.div
			ref={ref}
			className="relative w-full max-w-md overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_1px_rgba(0,0,0,0.4),0_24px_70px_-16px_rgba(0,0,0,0.75)]"
			initial={{ opacity: 0, y: 20 }}
			animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
			transition={{ duration: 0.5 }}
		>
			<div className="pointer-events-none absolute inset-0 z-10 rounded-lg ring-1 ring-inset ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />

			<div className="relative flex h-8 items-center border-b border-border/60 bg-card px-3">
				<div className="flex items-center gap-1.5">
					<div className="size-2 rounded-full bg-[#ff5f57]/85" />
					<div className="size-2 rounded-full bg-[#febc2e]/85" />
					<div className="size-2 rounded-full bg-[#28c840]/85" />
				</div>
				<span className="pointer-events-none absolute inset-x-0 text-center font-mono text-[10px] tracking-tight text-muted-foreground/60">
					automations
				</span>
			</div>

			<div className="p-4 font-mono text-[11px] leading-relaxed">
				<div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-2">
					<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
						<Trans id="marketing.features.automations.column.name">Name</Trans>
					</div>
					<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
						<Trans id="marketing.features.automations.column.schedule">
							Schedule
						</Trans>
					</div>
					<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
						<Trans id="marketing.features.automations.column.lastRun">
							Last run
						</Trans>
					</div>
					{AUTOMATIONS.map((automation, index) => (
						<m.div
							key={automation.name}
							className="contents"
							initial={{ opacity: 0 }}
							animate={isInView ? { opacity: 1 } : { opacity: 0 }}
							transition={{ duration: 0.3, delay: 0.15 + index * 0.08 }}
						>
							<div className="text-foreground/90">{automation.name}</div>
							<div className="text-muted-foreground/65">
								{t(automation.schedule)}
							</div>
							{automation.running ? (
								<div className="text-brand-light">
									⠋{" "}
									<Trans id="marketing.features.automations.running">
										running
									</Trans>
								</div>
							) : (
								<div className="text-muted-foreground/55">
									<span className="text-emerald-400/85">✓</span>{" "}
									{t(automation.lastRun)}
								</div>
							)}
						</m.div>
					))}
				</div>

				<div className="mt-4 space-y-1 border-t border-border/60 pt-3">
					<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
						daily-triage
					</div>
					{LOG_LINES.map((line, index) => (
						<m.div
							key={line.id}
							className="text-muted-foreground/70"
							initial={{ opacity: 0 }}
							animate={isInView ? { opacity: 1 } : { opacity: 0 }}
							transition={{ duration: 0.3, delay: 0.5 + index * 0.15 }}
						>
							<span className="text-muted-foreground/45">→</span>{" "}
							{t(line.message)}
						</m.div>
					))}
				</div>
			</div>
		</m.div>
	);
}
