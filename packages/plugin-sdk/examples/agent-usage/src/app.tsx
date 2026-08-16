import type { PluginSlotProps } from "@superset/plugin-sdk/ui";
import { useEffect, useState } from "react";

const BUCKET_MS = 10_000;
const BUCKET_COUNT = 12;

interface UsageRow {
	terminalId: string;
	workspaceId: string;
	workspaceName: string;
	branch: string | null;
	agentId: string;
	events: number;
	turns: number;
	blocked: number;
	startedAt: number;
	lastEventAt: number;
	lastEventType: string;
	activeMs: number;
	lastStartAt: number | null;
	buckets: number[];
	lastBucketStamp: number;
}

function gaugeColor(lastEventType: string): string {
	switch (lastEventType) {
		case "Start":
			return "#f59e0b";
		case "PermissionRequest":
			return "#ef4444";
		case "Stop":
			return "#22c55e";
		default:
			return "#71717a";
	}
}

function agentLabel(agentId: string): string {
	return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}

function elapsed(since: number, now: number): string {
	const s = Math.max(0, Math.round((now - since) / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m`;
	return `${Math.round(m / 60)}h`;
}

/** Buckets with entries older than the rolling window zeroed out client-side. */
function liveBuckets(row: UsageRow, now: number): number[] {
	const stamp = Math.floor(now / BUCKET_MS);
	const age = stamp - row.lastBucketStamp;
	if (age >= BUCKET_COUNT) return new Array(BUCKET_COUNT).fill(0);
	const buckets = [...row.buckets];
	for (let i = 1; i <= age; i++) {
		buckets[(row.lastBucketStamp + i) % BUCKET_COUNT] = 0;
	}
	return buckets;
}

function Gauge({
	fraction,
	color,
	turns,
}: {
	fraction: number;
	color: string;
	turns: number;
}) {
	const size = 110;
	const radius = 46;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference * (1 - Math.min(1, Math.max(0, fraction)));
	return (
		<svg
			role="img"
			aria-label="activity gauge"
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			data-testid="usage-gauge"
		>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke="rgba(128,128,128,0.2)"
				strokeWidth={8}
			/>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke={color}
				strokeWidth={8}
				strokeLinecap="round"
				strokeDasharray={circumference}
				strokeDashoffset={offset}
				transform={`rotate(-90 ${size / 2} ${size / 2})`}
				style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
			/>
			<text
				x={size / 2}
				y={size / 2 + 2}
				textAnchor="middle"
				fill="currentColor"
				style={{ fontSize: 26, fontWeight: 700 }}
			>
				{turns}
			</text>
			<text
				x={size / 2}
				y={size / 2 + 20}
				textAnchor="middle"
				fill="currentColor"
				style={{ fontSize: 10, opacity: 0.55 }}
			>
				turns
			</text>
		</svg>
	);
}

function Sparkline({ buckets }: { buckets: number[] }) {
	const max = Math.max(1, ...buckets);
	return (
		<div
			data-testid="usage-sparkline"
			style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 24 }}
		>
			{buckets.map((count, i) => (
				<div
					key={`bucket-${i}`}
					style={{
						width: 4,
						height: Math.max(2, Math.round((count / max) * 24)),
						borderRadius: 1,
						background: count > 0 ? "#f59e0b" : "rgba(128,128,128,0.25)",
						transition: "height 0.3s ease",
					}}
				/>
			))}
		</div>
	);
}

function UsageCard({ row, now }: { row: UsageRow; now: number }) {
	const buckets = liveBuckets(row, now);
	const bucketSum = buckets.reduce((total, count) => total + count, 0);
	// Share of the rolling 2-minute window with activity: full ring at 12
	// events (one per bucket), so a live agent run visibly moves the arc.
	const fraction = Math.min(1, bucketSum / BUCKET_COUNT);
	return (
		<div
			data-testid="usage-card"
			data-terminal-id={row.terminalId}
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 8,
				padding: "14px 12px",
				borderRadius: 10,
				border: "1px solid rgba(128,128,128,0.25)",
			}}
		>
			<div style={{ textAlign: "center" }}>
				<div style={{ fontWeight: 600 }}>
					{agentLabel(row.agentId)}
					<span style={{ opacity: 0.6, fontWeight: 400 }}>
						{" · "}
						{row.workspaceName}
					</span>
				</div>
				{row.branch ? (
					<div style={{ opacity: 0.5, fontSize: 11, fontFamily: "monospace" }}>
						{row.branch}
					</div>
				) : null}
			</div>
			<Gauge
				fraction={fraction}
				color={gaugeColor(row.lastEventType)}
				turns={row.turns}
			/>
			<Sparkline buckets={buckets} />
			<div style={{ display: "flex", gap: 12, fontSize: 11, opacity: 0.75 }}>
				<span>{row.events} events</span>
				<span>{row.blocked} blocked</span>
				<span>{elapsed(row.startedAt, now)}</span>
			</div>
		</div>
	);
}

export function AgentUsage({ ctx }: PluginSlotProps) {
	const [rows, setRows] = useState<UsageRow[] | null>(null);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		let cancelled = false;
		void ctx.invokeAction("get-stats").then((result) => {
			const value = (result as { rows?: UsageRow[] } | null)?.rows;
			if (!cancelled && value) setRows(value);
		});
		const offRealtime = ctx.onRealtime((payload) => {
			const msg = payload as { type?: string; rows?: UsageRow[] } | null;
			if (msg?.type === "stats" && msg.rows) setRows(msg.rows);
		});
		const tick = setInterval(() => setNow(Date.now()), 5000);
		return () => {
			cancelled = true;
			offRealtime();
			clearInterval(tick);
		};
	}, [ctx]);

	const sorted = rows
		? [...rows].sort((a, b) => b.lastEventAt - a.lastEventAt)
		: null;

	return (
		<div
			data-testid="agent-usage"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 14,
				padding: "18px 20px",
				fontSize: 12.5,
				overflowY: "auto",
				height: "100%",
			}}
		>
			<div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
				<span style={{ fontWeight: 600, fontSize: 15 }}>Agent Usage</span>
				<span style={{ opacity: 0.55 }}>
					per-agent activity, turns, and blocks
				</span>
			</div>

			{sorted === null ? (
				<div style={{ opacity: 0.6 }}>Loading…</div>
			) : sorted.length === 0 ? (
				<div data-testid="usage-empty" style={{ opacity: 0.6 }}>
					No agent activity yet. Launch an agent and watch the gauges move.
				</div>
			) : (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
						gap: 16,
						alignItems: "start",
					}}
				>
					{sorted.map((row) => (
						<UsageCard key={row.terminalId} row={row} now={now} />
					))}
				</div>
			)}
		</div>
	);
}
