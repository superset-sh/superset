"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	FACTORY_LEVELS,
	FORECAST_PERIODS,
	GATE_SCORECARD,
	PERIOD_T,
	TIMELINE_END,
	TIMELINE_START,
	TODAY_T,
} from "../../constants";
import { scrollToElement } from "../../utils/scrollToElement";
import { GateJumpLink } from "../GateJumpLink";
import { GateMeter } from "./components/GateMeter";

interface Waypoint {
	id: string;
	label: string;
	group: boolean;
}

const WAYPOINT_IDS = [
	"rubric",
	...FACTORY_LEVELS.map((level) => level.id),
	"forecast",
	...FORECAST_PERIODS.map((period) => period.id),
	"scorecard",
];

const MARKER_T: Record<string, number> = PERIOD_T;

const NEXT_GATE = GATE_SCORECARD.find(
	(score) => score.level === "F4" && score.status === "partial",
);

export function ProgressSidebar() {
	const { t } = useLingui();
	const [activeId, setActiveId] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const ticking = useRef(false);

	const waypoints = useMemo<Waypoint[]>(
		() => [
			{
				id: "rubric",
				label: t({
					message: "The rubric",
				}),
				group: true,
			},
			...FACTORY_LEVELS.map((level) => ({
				id: level.id,
				label: `${level.id} · ${t(level.name)}`,
				group: false,
			})),
			{
				id: "forecast",
				label: t({
					message: "The forecast",
				}),
				group: true,
			},
			...FORECAST_PERIODS.map((period) => ({
				id: period.id,
				label: `${t(period.period)} · ${t(period.title)}`,
				group: false,
			})),
			{
				id: "scorecard",
				label: t({
					message: "The scorecard",
				}),
				group: true,
			},
		],
		[t],
	);

	useEffect(() => {
		const update = () => {
			ticking.current = false;
			const doc = document.documentElement;
			const max = doc.scrollHeight - window.innerHeight;
			setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);

			const cutoff = window.innerHeight * 0.4;
			let current: string | null = null;
			for (const id of WAYPOINT_IDS) {
				const el = document.getElementById(id);
				if (el && el.getBoundingClientRect().top <= cutoff) {
					current = id;
				}
			}
			setActiveId(current);
		};
		const onScroll = () => {
			if (!ticking.current) {
				ticking.current = true;
				requestAnimationFrame(update);
			}
		};
		update();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
		};
	}, []);

	const active = waypoints.find((waypoint) => waypoint.id === activeId);
	const markerT = (activeId && MARKER_T[activeId]) || TODAY_T;
	const markerLeft =
		((markerT - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100;
	const todayLeft =
		((TODAY_T - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100;
	const inFuture = markerT > TODAY_T + 0.01;
	const readPercent = Math.round(progress * 100);

	const jumpTo = (id: string) => {
		const el = document.getElementById(id);
		if (!el) return;
		scrollToElement(el);
	};

	return (
		<nav
			aria-label={t({
				message: "Prediction progress",
			})}
			className="hidden xl:block fixed right-6 top-1/2 -translate-y-1/2 z-40 w-56"
		>
			<div className="border border-border bg-background/80 backdrop-blur-sm px-4 py-3">
				<div className="flex items-baseline justify-between">
					<span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
						Factory 2026
					</span>
					<span className="text-[10px] font-mono text-muted-foreground tabular-nums">
						<Trans>{readPercent}% read</Trans>
					</span>
				</div>
				<p className="text-xs font-mono text-foreground mt-1.5 leading-snug min-h-8">
					{active ? (
						active.label
					) : (
						<Trans>The self-driving software factory</Trans>
					)}
				</p>

				{/* Scenario timeline: where the section you are reading sits in time */}
				<div className="relative mt-2 h-8">
					<div className="absolute left-0 right-0 top-3 h-px bg-border" />
					{/* Today tick */}
					<div
						className="absolute top-1.5 h-3 w-px bg-brand/60"
						style={{ left: `${todayLeft}%` }}
					/>
					{/* Moving scenario marker */}
					<div
						className={`absolute top-3 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-500 ${
							inFuture ? "border border-brand bg-background" : "bg-brand"
						}`}
						style={{ left: `${markerLeft}%` }}
					/>
					<span className="absolute left-0 top-5 text-[9px] font-mono text-muted-foreground">
						{TIMELINE_START}
					</span>
					<span className="absolute right-0 top-5 text-[9px] font-mono text-muted-foreground">
						{TIMELINE_END}
					</span>
					<span
						className="absolute top-[-3px] -translate-x-1/2 text-[9px] font-mono text-brand/80"
						style={{ left: `${todayLeft}%` }}
					>
						<Trans>now</Trans>
					</span>
				</div>

				{/* Gate meters: the prediction's actual progress */}
				<div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2.5">
					<span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
						<Trans>Gates open</Trans>
					</span>
					<GateMeter level="F3" />
					<GateMeter level="F4" />
					{NEXT_GATE && (
						<p className="text-[10px] font-mono text-muted-foreground leading-snug mt-0.5">
							<Trans>Next:</Trans>{" "}
							<GateJumpLink
								targetId={`gate-${NEXT_GATE.gateId}`}
								className="text-foreground/80 hover:text-brand transition-colors"
							>
								{t(NEXT_GATE.gate).toLowerCase()} →
							</GateJumpLink>
						</p>
					)}
				</div>
			</div>

			<div className="relative mt-3 pl-4">
				{/* Rail with progress fill */}
				<div className="absolute left-0 top-1 bottom-1 w-px bg-border" />
				<div
					className="absolute left-0 top-1 w-px bg-brand"
					style={{
						height: `${progress * 100}%`,
						maxHeight: "calc(100% - 8px)",
					}}
				/>
				<ul className="flex flex-col gap-1">
					{waypoints.map((waypoint) => {
						const isActive = waypoint.id === activeId;
						return (
							<li key={waypoint.id}>
								<button
									type="button"
									onClick={() => jumpTo(waypoint.id)}
									className={`group flex w-full items-center gap-2 text-left text-[11px] font-mono transition-colors ${
										waypoint.group ? "uppercase tracking-wider mt-2" : "pl-3"
									} ${
										isActive
											? "text-foreground"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									<span
										className={`shrink-0 transition-colors ${isActive ? "text-brand" : "text-border group-hover:text-muted-foreground"}`}
										aria-hidden="true"
									>
										●
									</span>
									<span className="truncate">{waypoint.label}</span>
								</button>
							</li>
						);
					})}
				</ul>
			</div>
		</nav>
	);
}
