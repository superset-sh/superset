import type { PluginSlotProps } from "@superset/plugin-sdk/ui";
import { useEffect, useRef, useState } from "react";

type SheepStatus = "working" | "blocked" | "done" | "idle" | "ended";

interface SheepData {
	terminalId: string;
	agentId: string;
	workspaceName: string;
	status: SheepStatus;
	at: number;
}

interface Creature {
	data: SheepData;
	x: number;
	y: number;
	tx: number;
	ty: number;
	facing: 1 | -1;
	nextWanderAt: number;
	grazeUntil: number;
}

const STATUS_COLOR: Record<SheepStatus, string> = {
	working: "#f59e0b",
	blocked: "#ef4444",
	done: "#22c55e",
	idle: "#a1a1aa",
	ended: "#52525b",
};

const SPEED: Record<SheepStatus, number> = {
	working: 70,
	blocked: 0,
	done: 0,
	idle: 14,
	ended: 6,
};

const S = 3; // pixel scale

function drawSheep(
	g: CanvasRenderingContext2D,
	c: Creature,
	now: number,
): void {
	const { status } = c.data;
	const moving = SPEED[status] > 0 && (c.x !== c.tx || c.y !== c.ty);
	const hop = moving
		? Math.abs(Math.sin(now / (status === "working" ? 70 : 180))) * 2 * S
		: 0;
	const shake = status === "blocked" ? Math.sin(now / 45) * 1.2 : 0;
	const sitting = status === "done";
	const grazing = status === "idle" && now < c.grazeUntil;

	g.save();
	g.translate(Math.round(c.x + shake), Math.round(c.y - hop));
	if (status === "ended") g.globalAlpha = 0.35;
	if (c.facing === -1) g.scale(-1, 1);

	const px = (x: number, y: number, w: number, h: number, color: string) => {
		g.fillStyle = color;
		g.fillRect(x * S, y * S, w * S, h * S);
	};

	// legs (tucked when sitting)
	if (!sitting) {
		px(-3, 3, 1, 2, "#3f3f46");
		px(-1, 3, 1, 2, "#3f3f46");
		px(1, 3, 1, 2, "#3f3f46");
		px(3, 3, 1, 2, "#3f3f46");
	}
	const bodyY = sitting ? 0 : -1;
	// fluffy body
	px(-4, bodyY - 2, 8, 5, "#d4d4d8");
	px(-3, bodyY - 3, 6, 1, "#e4e4e7");
	px(-4, bodyY, 8, 2, "#c4c4ca");
	// head
	const headDip = grazing ? 2 : 0;
	px(3, bodyY - 2 + headDip, 3, 3, "#3f3f46");
	px(5, bodyY - 3 + headDip, 1, 1, "#3f3f46"); // ear
	px(5, bodyY - 1 + headDip, 1, 1, "#fafafa"); // eye

	// status accents (drawn unflipped-safe: symmetric enough)
	if (status === "blocked") {
		g.fillStyle = "#ef4444";
		g.fillRect(0, (bodyY - 8) * S, S, 3 * S);
		g.fillRect(0, (bodyY - 4) * S, S, S);
	}
	if (status === "done") {
		g.fillStyle = "#22c55e";
		g.fillRect(-1 * S, (bodyY - 6) * S, S, S);
		g.fillRect(0, (bodyY - 5) * S, S, S);
		g.fillRect(1 * S, (bodyY - 7) * S, S, S);
	}
	if (status === "working") {
		// little amber hard-hat
		px(3, bodyY - 3, 3, 1, "#f59e0b");
		px(4, bodyY - 4, 1, 1, "#f59e0b");
	}
	g.restore();

	// label
	g.save();
	g.globalAlpha = status === "ended" ? 0.3 : 0.65;
	g.fillStyle = "#e4e4e7";
	g.font = "10px ui-monospace, monospace";
	g.textAlign = "center";
	const cap = c.data.agentId.charAt(0).toUpperCase() + c.data.agentId.slice(1);
	g.fillText(`${cap} · ${c.data.workspaceName}`, c.x, c.y + 8 * S + 12);
	g.globalAlpha = 1;
	g.fillStyle = STATUS_COLOR[status];
	g.beginPath();
	g.arc(
		c.x - g.measureText(`${cap} · ${c.data.workspaceName}`).width / 2 - 8,
		c.y + 8 * S + 8.5,
		3,
		0,
		Math.PI * 2,
	);
	g.fill();
	g.restore();
}

export function Flock({ ctx }: PluginSlotProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const creaturesRef = useRef(new Map<string, Creature>());
	const [count, setCount] = useState(0);

	useEffect(() => {
		const apply = (sheep: SheepData[]) => {
			const creatures = creaturesRef.current;
			const seen = new Set<string>();
			const canvas = canvasRef.current;
			const w = canvas?.clientWidth ?? 600;
			const h = canvas?.clientHeight ?? 400;
			for (const data of sheep) {
				seen.add(data.terminalId);
				const existing = creatures.get(data.terminalId);
				if (existing) {
					existing.data = data;
				} else {
					const x = 60 + Math.random() * Math.max(60, w - 140);
					const y = 80 + Math.random() * Math.max(60, h - 160);
					creatures.set(data.terminalId, {
						data,
						x,
						y,
						tx: x,
						ty: y,
						facing: 1,
						nextWanderAt: 0,
						grazeUntil: 0,
					});
				}
			}
			for (const key of [...creatures.keys()]) {
				if (!seen.has(key)) creatures.delete(key);
			}
			setCount(creatures.size);
		};
		let cancelled = false;
		void ctx.invokeAction("get-flock").then((result) => {
			const sheep = (result as { sheep?: SheepData[] } | null)?.sheep;
			if (!cancelled && sheep) apply(sheep);
		});
		const unsubscribe = ctx.onRealtime((payload) => {
			const msg = payload as { type?: string; sheep?: SheepData[] } | null;
			if (msg?.type === "flock" && msg.sheep) apply(msg.sheep);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [ctx]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const g = canvas.getContext("2d");
		if (!g) return;
		let raf = 0;
		let last = performance.now();

		const resize = () => {
			const dpr = window.devicePixelRatio || 1;
			canvas.width = canvas.clientWidth * dpr;
			canvas.height = canvas.clientHeight * dpr;
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(canvas);

		const tick = (now: number) => {
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			const dpr = window.devicePixelRatio || 1;
			const w = canvas.clientWidth;
			const h = canvas.clientHeight;
			g.setTransform(dpr, 0, 0, dpr, 0, 0);
			g.imageSmoothingEnabled = false;
			// pasture
			g.fillStyle = "#101410";
			g.fillRect(0, 0, w, h);
			g.fillStyle = "rgba(74, 124, 60, 0.16)";
			for (let i = 0; i < 90; i++) {
				const gx = (i * 97) % w;
				const gy = (i * 53) % h;
				g.fillRect(gx, gy, 2, 4);
			}

			const creatures = [...creaturesRef.current.values()].sort(
				(a, b) => a.y - b.y,
			);
			for (const c of creatures) {
				const speed = SPEED[c.data.status];
				if (speed > 0) {
					if (now >= c.nextWanderAt) {
						c.tx = 40 + Math.random() * Math.max(60, w - 80);
						c.ty = 60 + Math.random() * Math.max(60, h - 120);
						c.nextWanderAt =
							now +
							(c.data.status === "working"
								? 700 + Math.random() * 900
								: 2500 + Math.random() * 4000);
						if (c.data.status === "idle" && Math.random() < 0.5) {
							c.grazeUntil = now + 1500;
						}
					}
					const dx = c.tx - c.x;
					const dy = c.ty - c.y;
					const dist = Math.hypot(dx, dy);
					if (dist > 2) {
						const step = Math.min(dist, speed * dt);
						c.x += (dx / dist) * step;
						c.y += (dy / dist) * step;
						c.facing = dx >= 0 ? 1 : -1;
					}
				}
				drawSheep(g, c, now);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, []);

	return (
		<div
			data-testid="flock-pane"
			style={{ position: "relative", height: "100%", overflow: "hidden" }}
		>
			<canvas
				ref={canvasRef}
				style={{ width: "100%", height: "100%", display: "block" }}
			/>
			<div
				style={{
					position: "absolute",
					top: 12,
					left: 14,
					display: "flex",
					alignItems: "baseline",
					gap: 8,
					fontSize: 12.5,
					color: "#e4e4e7",
				}}
			>
				<span style={{ fontWeight: 600 }}>Flock</span>
				<span data-testid="flock-count" style={{ opacity: 0.55 }}>
					{count} sheep · one per agent, live
				</span>
			</div>
			<div
				style={{
					position: "absolute",
					top: 14,
					right: 14,
					display: "flex",
					gap: 10,
					fontSize: 10.5,
					color: "#a1a1aa",
				}}
			>
				{(["working", "blocked", "done", "idle"] as const).map((s) => (
					<span
						key={s}
						style={{ display: "flex", alignItems: "center", gap: 4 }}
					>
						<span
							style={{
								width: 7,
								height: 7,
								borderRadius: 99,
								background: STATUS_COLOR[s],
							}}
						/>
						{s === "blocked" ? "needs you" : s}
					</span>
				))}
			</div>
		</div>
	);
}
