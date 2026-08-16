import type { PluginSlotProps } from "@superset/plugin-sdk/ui";
import { useCallback, useEffect, useState } from "react";

const MAX_RENDERED_LINES = 4000;

interface WorkspaceReview {
	id: string;
	name: string;
	branch: string;
	filesChanged: number;
	insertions: number;
	deletions: number;
	untracked: number;
}

function diffLineStyle(line: string): React.CSSProperties {
	if (
		line.startsWith("diff --git") ||
		line.startsWith("+++") ||
		line.startsWith("---")
	) {
		return { fontWeight: 600, opacity: 0.65 };
	}
	if (line.startsWith("@@")) {
		return { color: "#06b6d4", opacity: 0.85 };
	}
	if (line.startsWith("+")) {
		return { background: "rgba(34,197,94,0.12)", color: "#22c55e" };
	}
	if (line.startsWith("-")) {
		return { background: "rgba(239,68,68,0.12)", color: "#ef4444" };
	}
	return { opacity: 0.85 };
}

function Diffstat({ review }: { review: WorkspaceReview }) {
	return (
		<div style={{ display: "flex", gap: 8, fontSize: 11 }}>
			<span style={{ color: "#22c55e" }}>+{review.insertions}</span>
			<span style={{ color: "#ef4444" }}>-{review.deletions}</span>
			<span style={{ opacity: 0.6 }}>
				{review.filesChanged} {review.filesChanged === 1 ? "file" : "files"}
			</span>
			{review.untracked > 0 ? (
				<span style={{ opacity: 0.5 }}>{review.untracked} untracked</span>
			) : null}
		</div>
	);
}

function ReviewCard({
	review,
	selected,
	onSelect,
}: {
	review: WorkspaceReview;
	selected: boolean;
	onSelect: (workspaceId: string) => void;
}) {
	return (
		<button
			type="button"
			data-testid="review-card"
			data-selected={selected || undefined}
			data-workspace-id={review.id}
			onClick={() => onSelect(review.id)}
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 4,
				padding: "8px 10px",
				borderRadius: 8,
				border: selected
					? "1px solid rgba(128,128,128,0.6)"
					: "1px solid rgba(128,128,128,0.25)",
				background: selected ? "rgba(128,128,128,0.12)" : "transparent",
				cursor: "pointer",
				textAlign: "left",
				width: "100%",
				color: "inherit",
				font: "inherit",
			}}
		>
			<div style={{ fontWeight: 600 }}>{review.name}</div>
			<div style={{ opacity: 0.55, fontSize: 11, fontFamily: "monospace" }}>
				{review.branch}
			</div>
			<Diffstat review={review} />
		</button>
	);
}

function DiffView({
	review,
	diff,
	loading,
}: {
	review: WorkspaceReview;
	diff: string | null;
	loading: boolean;
}) {
	const lines = diff === null ? [] : diff.split("\n");
	const truncated = lines.length > MAX_RENDERED_LINES;
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
				minWidth: 0,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "baseline",
					gap: 10,
					padding: "12px 16px",
					borderBottom: "1px solid rgba(128,128,128,0.2)",
				}}
			>
				<span style={{ fontWeight: 600, fontSize: 14 }}>{review.name}</span>
				<span style={{ opacity: 0.55, fontSize: 11, fontFamily: "monospace" }}>
					{review.branch}
				</span>
			</div>
			{loading ? (
				<div style={{ padding: 16, opacity: 0.6 }}>Loading diff…</div>
			) : diff === null || diff.trim() === "" ? (
				<div style={{ padding: 16, opacity: 0.6 }}>No diff to show.</div>
			) : (
				<div
					data-testid="review-diff"
					style={{
						flex: 1,
						overflow: "auto",
						padding: "10px 0",
						fontFamily: "monospace",
						fontSize: 11.5,
						lineHeight: 1.5,
					}}
				>
					{lines.slice(0, MAX_RENDERED_LINES).map((line, index) => (
						<div
							key={index}
							style={{
								padding: "0 16px",
								whiteSpace: "pre",
								...diffLineStyle(line),
							}}
						>
							{line || " "}
						</div>
					))}
					{truncated ? (
						<div style={{ padding: "8px 16px", opacity: 0.55 }}>
							… {lines.length - MAX_RENDERED_LINES} more lines not rendered …
						</div>
					) : null}
				</div>
			)}
		</div>
	);
}

export function FleetReview({ ctx }: PluginSlotProps) {
	const [reviews, setReviews] = useState<WorkspaceReview[] | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [diff, setDiff] = useState<string | null>(null);
	const [diffLoading, setDiffLoading] = useState(false);

	const refresh = useCallback(() => {
		void ctx.invokeAction("list").then((result) => {
			const value = (result as { workspaces?: WorkspaceReview[] } | null)
				?.workspaces;
			if (value) setReviews(value);
		});
	}, [ctx]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const select = useCallback(
		(workspaceId: string) => {
			setSelectedId(workspaceId);
			setDiff(null);
			setDiffLoading(true);
			void ctx
				.invokeAction("diff", { workspaceId })
				.then((result) => {
					setDiff((result as { diff?: string } | null)?.diff ?? "");
				})
				.catch(() => setDiff(""))
				.finally(() => setDiffLoading(false));
		},
		[ctx],
	);

	const selected = reviews?.find((r) => r.id === selectedId) ?? null;

	return (
		<div
			data-testid="fleet-review"
			style={{
				display: "flex",
				height: "100%",
				fontSize: 12.5,
				color: "var(--foreground, inherit)",
			}}
		>
			<div
				style={{
					width: 260,
					flexShrink: 0,
					display: "flex",
					flexDirection: "column",
					gap: 8,
					padding: 12,
					overflowY: "auto",
					borderRight: "1px solid rgba(128,128,128,0.2)",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<span style={{ fontWeight: 600, fontSize: 13 }}>Fleet Review</span>
					<button
						type="button"
						data-testid="review-refresh"
						onClick={refresh}
						style={{
							border: "1px solid rgba(128,128,128,0.3)",
							background: "transparent",
							color: "inherit",
							borderRadius: 6,
							padding: "3px 8px",
							fontSize: 11,
							cursor: "pointer",
							opacity: 0.75,
						}}
					>
						Refresh
					</button>
				</div>
				{reviews === null ? (
					<div style={{ opacity: 0.6 }}>Loading…</div>
				) : reviews.length === 0 ? (
					<div style={{ opacity: 0.6 }}>
						No pending changes across your workspaces.
					</div>
				) : (
					reviews.map((review) => (
						<ReviewCard
							key={review.id}
							review={review}
							selected={review.id === selectedId}
							onSelect={select}
						/>
					))
				)}
			</div>
			{selected ? (
				<DiffView review={selected} diff={diff} loading={diffLoading} />
			) : (
				<div
					style={{
						flex: 1,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						opacity: 0.5,
					}}
				>
					Select a workspace to review its diff.
				</div>
			)}
		</div>
	);
}
