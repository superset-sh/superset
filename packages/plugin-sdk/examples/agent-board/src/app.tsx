import type { PluginSlotProps, PluginUiContext } from "@superset/plugin-sdk/ui";
import { useEffect, useState } from "react";

interface Card {
	terminalId: string;
	workspaceId: string;
	workspaceName: string;
	branch: string | null;
	agentId: string;
	status: "working" | "blocked" | "failed" | "done" | "idle" | "ended";
	at: number;
}

const SECTIONS = [
	{ key: "working", title: "Working", color: "#f59e0b", statuses: ["working"] },
	{
		key: "blocked",
		title: "Needs you",
		color: "#ef4444",
		statuses: ["blocked", "failed"],
	},
	{ key: "done", title: "Done", color: "#22c55e", statuses: ["done"] },
	{
		key: "quiet",
		title: "Idle",
		color: "#71717a",
		statuses: ["idle", "ended"],
	},
] as const;

function timeAgo(at: number, now: number): string {
	const s = Math.max(0, Math.round((now - at) / 1000));
	if (s < 60) return `${s}s ago`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	return `${Math.round(m / 60)}h ago`;
}

function agentLabel(agentId: string): string {
	return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}

function useBoard(ctx: PluginUiContext) {
	const [cards, setCards] = useState<Card[] | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		let cancelled = false;
		void ctx.invokeAction("get-board").then((result) => {
			const value = (result as { cards?: Card[] } | null)?.cards;
			if (!cancelled && value) setCards(value);
		});
		const offRealtime = ctx.onRealtime((payload) => {
			const msg = payload as { type?: string; cards?: Card[] } | null;
			if (msg?.type === "board" && msg.cards) setCards(msg.cards);
		});
		// Selection is shared across this plugin's mounted surfaces: clicking a
		// card in the sidebar tab highlights it in the pane, and vice versa.
		const offMessage = ctx.onMessage((payload) => {
			const msg = payload as { type?: string; terminalId?: string } | null;
			if (msg?.type === "select-card") setSelected(msg.terminalId ?? null);
		});
		const tick = setInterval(() => setNow(Date.now()), 5000);
		return () => {
			cancelled = true;
			offRealtime();
			offMessage();
			clearInterval(tick);
		};
	}, [ctx]);

	const select = (terminalId: string) => {
		const next = selected === terminalId ? null : terminalId;
		setSelected(next);
		ctx.postMessage({ type: "select-card", terminalId: next });
	};

	return { cards, selected, select, now };
}

function AgentCard({
	card,
	color,
	now,
	selected,
	onSelect,
}: {
	card: Card;
	color: string;
	now: number;
	selected: boolean;
	onSelect: (terminalId: string) => void;
}) {
	return (
		<button
			type="button"
			data-testid="board-card"
			data-selected={selected || undefined}
			data-terminal-id={card.terminalId}
			onClick={() => onSelect(card.terminalId)}
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 3,
				padding: "8px 10px",
				borderRadius: 8,
				textAlign: "left",
				width: "100%",
				background: "transparent",
				color: "inherit",
				font: "inherit",
				border: selected
					? `1px solid ${color}`
					: "1px solid rgba(128,128,128,0.25)",
				borderLeft: `3px solid ${color}`,
				boxShadow: selected ? `0 0 0 1px ${color}` : "none",
				opacity: card.status === "ended" ? 0.55 : 1,
				cursor: "pointer",
			}}
		>
			<div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
				<span style={{ fontWeight: 600 }}>{agentLabel(card.agentId)}</span>
				<span style={{ opacity: 0.55, fontSize: 11 }}>
					{timeAgo(card.at, now)}
				</span>
			</div>
			<div style={{ opacity: 0.75 }}>{card.workspaceName}</div>
			{card.branch ? (
				<div style={{ opacity: 0.5, fontSize: 11, fontFamily: "monospace" }}>
					{card.branch}
				</div>
			) : null}
		</button>
	);
}

function Board({
	ctx,
	variant,
}: {
	ctx: PluginUiContext;
	variant: "tab" | "pane";
}) {
	const { cards, selected, select, now } = useBoard(ctx);
	const isPane = variant === "pane";

	return (
		<div
			data-testid={isPane ? "agent-board-pane" : "agent-board"}
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 14,
				padding: isPane ? "18px 20px" : "14px 12px",
				fontSize: 12.5,
				overflowY: "auto",
				height: "100%",
			}}
		>
			<div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
				<span style={{ fontWeight: 600, fontSize: isPane ? 15 : 13 }}>
					Agent Board
				</span>
				<span style={{ opacity: 0.55 }}>
					every agent, every workspace, live
				</span>
			</div>

			{cards === null ? (
				<div style={{ opacity: 0.6 }}>Loading…</div>
			) : (
				<div
					style={
						isPane
							? {
									display: "grid",
									gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
									gap: 16,
									alignItems: "start",
								}
							: { display: "flex", flexDirection: "column", gap: 14 }
					}
				>
					{SECTIONS.map((section) => {
						const rows = cards.filter((c) =>
							(section.statuses as readonly string[]).includes(c.status),
						);
						return (
							<div
								key={section.key}
								data-testid={`board-section-${section.key}`}
								style={{ display: "flex", flexDirection: "column", gap: 6 }}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										textTransform: "uppercase",
										letterSpacing: 0.6,
										fontSize: 10.5,
										opacity: 0.75,
									}}
								>
									<span
										style={{
											width: 7,
											height: 7,
											borderRadius: 99,
											background: section.color,
											boxShadow:
												section.key === "working" && rows.length > 0
													? `0 0 6px ${section.color}`
													: "none",
										}}
									/>
									{section.title}
									<span style={{ opacity: 0.6 }}>{rows.length}</span>
								</div>
								{rows.length === 0 ? (
									<div style={{ opacity: 0.35, paddingLeft: 13 }}>—</div>
								) : (
									rows.map((card) => (
										<AgentCard
											key={card.terminalId}
											card={card}
											color={section.color}
											now={now}
											selected={selected === card.terminalId}
											onSelect={select}
										/>
									))
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

export function AgentBoard({ ctx }: PluginSlotProps) {
	return <Board ctx={ctx} variant="tab" />;
}

export function AgentBoardPane({ ctx }: PluginSlotProps) {
	return <Board ctx={ctx} variant="pane" />;
}
