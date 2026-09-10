"use client";

import { Trans, useLingui } from "@lingui/react/macro";

import { useEffect, useMemo, useRef, useState } from "react";
import { tierRgb } from "@/app/[lang]/components/TierBadge";
import { fetchViewer } from "@/app/[lang]/utils/fetchViewer";
import { HOUSE_FIGHTERS } from "../../constants";
import type { Fighter, Side } from "../../utils/simulateFight";
import { simulateFight } from "../../utils/simulateFight";
import { fromViewer } from "../../utils/toFighter";
import { CombatLog } from "../CombatLog";
import { DinoSprite, type FrameName, RUN_CYCLE } from "../DinoSprite";
import { FighterPanel } from "../FighterPanel";
import { FighterStage } from "../FighterStage";
import { ImpactBurst } from "../ImpactBurst";
import { RosterPicker } from "../RosterPicker";
import { StatReadout } from "../StatReadout";

type Phase = "select" | "scan" | "fight" | "done";
type Beat = "charge" | "impact" | "recover";

const SCAN_MS = 1900;
const TURN_MS = 1250;
const CHARGE_MS = 380;
const IMPACT_MS = 320;
const RUN_TICK_MS = 80;
const HOME_A = "translateX(calc(-100% - var(--spread)))";
const CLASH_A = "translateX(calc(-100% + var(--spread) - 0.5rem))";
const FLINCH_A = "translateX(calc(-100% - var(--spread) - 0.9rem))";

const HOME_B = "translateX(calc(100% + var(--spread)))";
const CLASH_B = "translateX(calc(100% - var(--spread) + 0.5rem))";
const FLINCH_B = "translateX(calc(100% + var(--spread) + 0.9rem))";

interface FightArenaProps {
	initialA: Fighter | null;
	initialB: Fighter | null;
}

export function FightArena({ initialA, initialB }: FightArenaProps) {
	const { t } = useLingui();
	const [a, setA] = useState<Fighter | null>(initialA);
	const [b, setB] = useState<Fighter | null>(initialB);
	const [phase, setPhase] = useState<Phase>("select");
	const [step, setStep] = useState(-1);
	const [beat, setBeat] = useState<Beat>("recover");
	const [tick, setTick] = useState(0);
	const [banner, setBanner] = useState(false);
	const [koSettled, setKoSettled] = useState(false);
	const [viewer, setViewer] = useState<Fighter | null>(null);
	const [copied, setCopied] = useState(false);
	const arena = useRef<HTMLDivElement>(null);

	const result = useMemo(() => (a && b ? simulateFight(a, b) : null), [a, b]);

	useEffect(() => {
		let live = true;
		fetchViewer().then((viewer) => {
			if (!live || !viewer) return;
			const self = fromViewer(viewer);
			setViewer(self);
			if (!initialA && initialB?.handle !== self.handle) {
				setA((current) => current ?? self);
			}
		});
		return () => {
			live = false;
		};
	}, [initialA, initialB]);

	useEffect(() => {
		const url = new URL(window.location.href);
		if (a) url.searchParams.set("a", a.handle);
		else url.searchParams.delete("a");
		if (b) url.searchParams.set("b", b.handle);
		else url.searchParams.delete("b");
		window.history.replaceState(null, "", url);
		setCopied(false);
	}, [a, b]);

	useEffect(() => {
		if (phase !== "scan") return;
		const timer = setTimeout(() => {
			setStep(0);
			setPhase("fight");
			setBanner(true);
		}, SCAN_MS);
		return () => clearTimeout(timer);
	}, [phase]);

	useEffect(() => {
		if (!banner) return;
		const timer = setTimeout(() => setBanner(false), 700);
		return () => clearTimeout(timer);
	}, [banner]);

	useEffect(() => {
		if (phase !== "fight" || !result) return;
		const last = result.events.length - 1;
		const timer = setTimeout(
			() => (step >= last ? setPhase("done") : setStep(step + 1)),
			TURN_MS,
		);
		return () => clearTimeout(timer);
	}, [phase, step, result]);

	useEffect(() => {
		if (phase !== "fight" || step < 0) return;
		setBeat("charge");
		const toImpact = setTimeout(() => setBeat("impact"), CHARGE_MS);
		const toRecover = setTimeout(
			() => setBeat("recover"),
			CHARGE_MS + IMPACT_MS,
		);
		return () => {
			clearTimeout(toImpact);
			clearTimeout(toRecover);
		};
	}, [phase, step]);

	useEffect(() => {
		if (phase !== "fight") return;
		const timer = setInterval(() => setTick((value) => value + 1), RUN_TICK_MS);
		return () => clearInterval(timer);
	}, [phase]);

	useEffect(() => {
		if (phase !== "done") {
			setKoSettled(false);
			return;
		}
		const timer = setTimeout(() => setKoSettled(true), 1050);
		return () => clearTimeout(timer);
	}, [phase]);

	const start = () => {
		setStep(-1);
		setBeat("recover");
		setKoSettled(false);
		setPhase("scan");
		requestAnimationFrame(() =>
			arena.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
		);
	};

	const pick = (fighter: Fighter) => {
		if (!a) setA(fighter);
		else setB(fighter);
	};

	const randomBrawl = () => {
		const pool = [...HOUSE_FIGHTERS];
		const first = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
		const second = pool[Math.floor(Math.random() * pool.length)];
		if (!first || !second) return;
		setA(first);
		setB(second);
		setStep(-1);
		setBeat("recover");
		setKoSettled(false);
		setPhase("scan");
	};

	const reset = () => {
		setPhase("select");
		setStep(-1);
		setBanner(false);
	};

	const event =
		phase === "fight" && step >= 0 ? result?.events[step] : undefined;
	const hp =
		event?.hp ??
		(result ? { a: result.kits.a.hp, b: result.kits.b.hp } : { a: 0, b: 0 });
	const finalHp = result?.events.at(-1)?.hp ?? hp;
	const shown = phase === "done" ? finalHp : hp;
	const impact = beat === "impact" && !!event;
	const leaping = step >= 0 && step % 2 === 1;
	const heavyHit =
		!!event &&
		!!result &&
		(event.crit ||
			event.damage >=
				result.kits[event.attacker === "a" ? "b" : "a"].hp * 0.18);

	const runFrame = (): FrameName =>
		RUN_CYCLE[tick % RUN_CYCLE.length] ?? "run1";

	const frameFor = (side: Side): FrameName => {
		if (phase === "done" && result)
			return side === result.loser ? "ko" : "roar";
		if (phase === "scan") return tick % 2 === 0 ? "stand" : "idle";
		if (!event) return "stand";
		const attacking = event.attacker === side;
		if (beat === "charge") return attacking ? runFrame() : "stand";
		if (beat === "impact") return attacking ? "bite" : "hurt";
		return attacking ? runFrame() : "stand";
	};

	const offsetFor = (side: Side): string => {
		const home = side === "a" ? HOME_A : HOME_B;
		if (!event || phase !== "fight") return home;
		if (event.attacker === side) {
			if (beat === "recover") return home;
			return side === "a" ? CLASH_A : CLASH_B;
		}
		if (beat !== "impact") return home;
		return side === "a" ? FLINCH_A : FLINCH_B;
	};

	if (!result || phase === "select") {
		const ready = !!a && !!b;

		return (
			<div className="fight-select flex flex-col gap-9">
				<style>{`
					.fight-select { --stage-dino: 7rem; }
					@media (min-width: 768px) { .fight-select { --stage-dino: 10rem; } }
					@keyframes fight-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
					@keyframes fight-pulse { 0%,100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.12); } }
					@keyframes fight-card-hop { 0%,100% { transform: translateY(0); } 35% { transform: translateY(-8px); } 60% { transform: translateY(0); } 78% { transform: translateY(-3px); } }
					@keyframes fight-vs { 0%,100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.14); opacity: 1; } }
					@keyframes fight-ready { 0%,100% { box-shadow: 0 0 0 0 rgba(210,86,17,0.55); } 50% { box-shadow: 0 0 26px 3px rgba(210,86,17,0.45); } }
					.fight-bob { animation: fight-bob 1.6s ease-in-out infinite; }
					.fight-pulse { animation: fight-pulse 1.5s ease-in-out infinite; }
					.fight-vs { animation: fight-vs 1.5s ease-in-out infinite; }
					.fight-ready { animation: fight-ready 1.5s ease-in-out infinite; }
					.fight-card:hover:not(:disabled) .fight-card-dino { animation: fight-card-hop 620ms ease-in-out; }
					@media (prefers-reduced-motion: reduce) {
						.fight-bob, .fight-pulse, .fight-vs, .fight-ready, .fight-card-dino { animation: none !important; }
					}
				`}</style>

				<div className="relative grid grid-cols-2 gap-4 md:gap-10 items-end">
					<FighterStage
						side="a"
						fighter={a}
						isViewer={!!a && a.handle === viewer?.handle}
						onClear={() => setA(null)}
					/>
					<FighterStage side="b" fighter={b} onClear={() => setB(null)} />

					<span
						aria-hidden="true"
						className={`${ready ? "fight-vs" : ""} pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 font-mono text-4xl md:text-6xl font-bold tracking-[0.1em] ${
							ready ? "text-brand" : "text-muted-foreground/30"
						}`}
						style={
							ready
								? { textShadow: "0 0 24px rgba(210,86,17,0.55)" }
								: undefined
						}
					>
						VS
					</span>
				</div>

				{viewer && a?.handle !== viewer.handle && (
					<button
						type="button"
						onClick={() => {
							setA(viewer);
							if (b?.handle === viewer.handle) setB(null);
						}}
						className="self-start font-mono text-[0.58rem] uppercase tracking-[0.16em] text-brand hover:text-brand-light transition-colors"
					>
						↩ fight as yourself
					</button>
				)}

				{ready && (
					<div className="grid grid-cols-2 gap-4 md:gap-10">
						<StatReadout fighter={a} align="left" />
						<StatReadout fighter={b} align="right" />
					</div>
				)}

				<RosterPicker seated={[a?.handle, b?.handle]} onPick={pick} />

				<div className="flex flex-col items-center gap-3">
					<button
						type="button"
						disabled={!ready}
						onClick={start}
						className={`border px-12 py-3.5 font-mono text-sm uppercase tracking-[0.28em] transition-colors ${
							ready
								? "fight-ready border-brand bg-brand/15 text-brand hover:bg-brand/25"
								: "border-border bg-transparent text-muted-foreground/40 cursor-not-allowed"
						}`}
					>
						{ready ? "fight!" : "pick two fighters"}
					</button>
					<button
						type="button"
						onClick={randomBrawl}
						className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground hover:text-brand transition-colors"
					>
						random brawl →
					</button>
				</div>
			</div>
		);
	}

	const winner = result.winner === "a" ? a : b;
	const knockedOut = finalHp.a <= 0 || finalHp.b <= 0;

	return (
		<div className="flex flex-col gap-6" ref={arena}>
			<style>{`
				@keyframes fight-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
				@keyframes fight-shake { 0%,100% { transform: translate(0,0); } 20% { transform: translate(-7px,3px); } 45% { transform: translate(6px,-4px); } 70% { transform: translate(-4px,-2px); } }
				@keyframes fight-shake-hard { 0%,100% { transform: translate(0,0); } 15% { transform: translate(-14px,6px) rotate(-0.6deg); } 40% { transform: translate(13px,-7px) rotate(0.6deg); } 65% { transform: translate(-9px,4px); } 85% { transform: translate(6px,-3px); } }
				@keyframes fight-float { 0% { opacity: 1; transform: translate(-50%,0) scale(0.7); } 25% { transform: translate(-50%,-16px) scale(1.25); } 100% { opacity: 0; transform: translate(-50%,-64px) scale(1); } }
				@keyframes fight-burst { 0% { opacity: 1; transform: translate(-50%,-50%) scale(0.25) rotate(0deg); } 70% { opacity: 0.85; } 100% { opacity: 0; transform: translate(-50%,-50%) scale(1.6) rotate(35deg); } }
				@keyframes fight-scan { from { transform: translateY(-100%); } to { transform: translateY(420%); } }
				@keyframes fight-dust { 0% { opacity: 0.75; transform: translate(0,0) scale(0.6); } 100% { opacity: 0; transform: translate(var(--dx),-14px) scale(1.5); } }
				@keyframes fight-flash { 0% { opacity: 0.85; } 100% { opacity: 0; } }
				@keyframes fight-banner { 0% { opacity: 0; transform: scale(2.6); letter-spacing: 1.4em; } 45% { opacity: 1; transform: scale(1); letter-spacing: 0.3em; } 100% { opacity: 0; transform: scale(0.9); } }
				@keyframes fight-stamp { 0% { opacity: 0; transform: scale(3.4) rotate(-14deg); } 55% { opacity: 1; transform: scale(0.92) rotate(3deg); } 75% { transform: scale(1.06) rotate(-1deg); } 100% { opacity: 1; transform: scale(1) rotate(0deg); } }
				@keyframes fight-hop { 0%,100% { transform: translateY(0); } 30% { transform: translateY(-16px); } 55% { transform: translateY(0); } 70% { transform: translateY(-7px); } }
				@keyframes fight-ko {
					0%   { transform: translate(0,0) rotate(0deg); }
					10%  { transform: translate(calc(var(--kx) * 1), -62px) rotate(-60deg); }
					26%  { transform: translate(calc(var(--kx) * 2.2), -22px) rotate(-200deg); }
					40%  { transform: translate(calc(var(--kx) * 3.0), 2px) rotate(-320deg); }
					54%  { transform: translate(calc(var(--kx) * 3.8), -22px) rotate(-450deg); }
					70%  { transform: translate(calc(var(--kx) * 4.5), 4px) rotate(-560deg); }
					84%  { transform: translate(calc(var(--kx) * 4.9), -6px) rotate(-620deg); }
					100% { transform: translate(calc(var(--kx) * 5.1), 8px) rotate(-630deg); }
				}
				@keyframes fight-stagger {
					0%   { transform: translate(0,0) rotate(0deg); }
					22%  { transform: translate(calc(var(--sx) * 1), -12px) rotate(calc(var(--sr) * 1)); }
					50%  { transform: translate(calc(var(--sx) * 1.9), 3px) rotate(calc(var(--sr) * 1.7)); }
					78%  { transform: translate(calc(var(--sx) * 0.8), 0) rotate(calc(var(--sr) * 0.5)); }
					100% { transform: translate(0,0) rotate(0deg); }
				}
				@keyframes fight-leap {
					0%   { transform: translateY(0) rotate(0deg); }
					35%  { transform: translateY(-62px) rotate(var(--lr)); }
					68%  { transform: translateY(-34px) rotate(var(--lr)); }
					100% { transform: translateY(0) rotate(0deg); }
				}
				@keyframes fight-landing {
					0%   { opacity: 0.6; transform: translateX(-50%) scaleX(0.4); }
					100% { opacity: 0; transform: translateX(-50%) scaleX(3.4); }
				}
				@keyframes fight-speed { 0% { opacity: 0; transform: scaleX(0.2); } 40% { opacity: 0.9; } 100% { opacity: 0; transform: scaleX(1.6); } }
				.fight-stage { --dino: 5.5rem; --spread: 4.5rem; }
				@media (min-width: 768px) { .fight-stage { --dino: 8rem; --spread: 12rem; } }
				.fight-bob { animation: fight-bob 1.1s steps(2,end) infinite; }
				.fight-shake { animation: fight-shake 300ms ease-in-out; }
				.fight-shake-hard { animation: fight-shake-hard 420ms ease-in-out; }
				.fight-float { animation: fight-float 1000ms ease-out forwards; }
				.fight-burst { animation: fight-burst 420ms ease-out forwards; }
				.fight-scan { animation: fight-scan 1.9s linear infinite; }
				.fight-dust { animation: fight-dust 460ms ease-out infinite; }
				.fight-flash { animation: fight-flash 260ms ease-out forwards; }
				.fight-banner { animation: fight-banner 700ms ease-out forwards; }
				.fight-stamp { animation: fight-stamp 620ms cubic-bezier(.2,1.4,.4,1) forwards; }
				.fight-hop { animation: fight-hop 1.1s ease-in-out infinite; }
				.fight-speed { animation: fight-speed 380ms ease-out forwards; }
				.fight-ko { animation: fight-ko 1400ms cubic-bezier(.3,.7,.5,1) forwards; }
				.fight-stagger { animation: fight-stagger 700ms cubic-bezier(.3,1.2,.5,1); }
				.fight-leap { animation: fight-leap 700ms cubic-bezier(.35,.1,.5,1); }
				.fight-landing { animation: fight-landing 520ms ease-out 1150ms forwards; }
				@media (prefers-reduced-motion: reduce) {
					.fight-bob, .fight-shake, .fight-shake-hard, .fight-dust, .fight-hop, .fight-scan, .fight-speed, .fight-stagger, .fight-leap, .fight-landing { animation: none; }
					.fight-ko { animation-duration: 200ms; }
					.fight-float, .fight-burst, .fight-flash { animation-duration: 1ms; }
					.fight-banner, .fight-stamp { animation-duration: 120ms; }
				}
			`}</style>

			<div className="grid grid-cols-2 gap-4 md:gap-10">
				{a && (
					<FighterPanel
						fighter={a}
						kit={result.kits.a}
						hp={shown.a}
						align="left"
						dimmed={phase === "done" && result.loser === "a"}
					/>
				)}
				{b && (
					<FighterPanel
						fighter={b}
						kit={result.kits.b}
						hp={shown.b}
						align="right"
						dimmed={phase === "done" && result.loser === "b"}
					/>
				)}
			</div>

			<div
				className={`relative border border-border/70 bg-background/40 overflow-hidden ${
					impact ? (event?.crit ? "fight-shake-hard" : "fight-shake") : ""
				}`}
			>
				{phase === "scan" && (
					<div
						aria-hidden="true"
						className="fight-scan pointer-events-none absolute inset-x-0 top-0 h-16 z-10"
						style={{
							background:
								"linear-gradient(to bottom, transparent, rgba(210,86,17,0.16), transparent)",
						}}
					/>
				)}

				{impact && event?.crit && (
					<div
						key={`flash-${step}`}
						aria-hidden="true"
						className="fight-flash pointer-events-none absolute inset-0 z-30 bg-white"
					/>
				)}

				<div className="fight-stage relative h-64 md:h-72">
					<div
						aria-hidden="true"
						className="absolute inset-x-0 bottom-14 h-px bg-border"
					/>
					<div
						aria-hidden="true"
						className="absolute inset-x-0 bottom-0 h-14"
						style={{
							backgroundImage:
								"repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 28px)",
						}}
					/>

					{(["a", "b"] as const).map((side) => {
						const fighter = side === "a" ? a : b;
						if (!fighter) return null;
						const rgb = tierRgb(fighter.tier);
						const attacking = event?.attacker === side;
						const defending = !!event && !attacking;
						const down = phase === "done" && result.loser === side;
						const champion = phase === "done" && result.winner === side;
						const offset = offsetFor(side);
						const charging =
							phase === "fight" && attacking && beat !== "recover";

						return (
							<div
								key={side}
								className={`absolute bottom-11 ${side === "a" ? "left-1/2" : "right-1/2"}`}
								style={{
									transform: offset,
									transition: `transform ${CHARGE_MS}ms cubic-bezier(.4,0,.3,1)`,
								}}
							>
								<div
									key={
										down
											? "ko"
											: champion
												? "champion"
												: defending && impact && heavyHit
													? `stagger-${step}`
													: attacking && leaping && beat !== "recover"
														? `leap-${step}`
														: "idle"
									}
									className={`relative ${
										down
											? "fight-ko"
											: champion
												? "fight-hop"
												: defending && impact && heavyHit
													? "fight-stagger"
													: attacking && leaping && beat !== "recover"
														? "fight-leap"
														: phase === "scan"
															? "fight-bob"
															: ""
									}`}
									style={
										{
											"--kx": side === "a" ? "-7px" : "7px",
											"--sx": side === "a" ? "-14px" : "14px",
											"--sr": side === "a" ? "-16deg" : "16deg",
											"--lr": side === "a" ? "12deg" : "-12deg",
										} as React.CSSProperties
									}
								>
									{defending && impact && (
										<>
											<ImpactBurst key={`burst-${step}`} crit={!!event?.crit} />
											<span
												key={`dmg-${step}`}
												className="fight-float absolute left-1/2 -top-6 font-mono text-lg md:text-xl font-bold tabular-nums z-30 whitespace-nowrap"
												style={{
													color: event?.crit
														? "rgb(255,206,84)"
														: "rgb(236,120,64)",
													textShadow: "0 2px 0 rgba(0,0,0,0.6)",
												}}
											>
												−{event?.damage}
											</span>
										</>
									)}

									{charging && (
										<div
											aria-hidden="true"
											className={`fight-speed absolute top-1/3 h-px w-16 z-0 ${side === "a" ? "right-full origin-right" : "left-full origin-left"}`}
											style={{
												background: `linear-gradient(to ${side === "a" ? "left" : "right"}, rgba(${rgb},0.75), transparent)`,
											}}
										/>
									)}

									<DinoSprite
										frame={frameFor(side)}
										rgb={rgb}
										facing={side === "a" ? "right" : "left"}
										flash={defending && impact}
										title={`${fighter.name} as a terminal dinosaur`}
										style={{ width: "var(--dino)" }}
										className={`relative z-10 h-auto origin-bottom transition-opacity duration-700 ${
											down && koSettled ? "opacity-70" : ""
										}`}
									/>

									<div
										aria-hidden="true"
										className="absolute left-1/2 -bottom-1 h-1.5 -translate-x-1/2 rounded-[50%] bg-black/50 blur-[1px] transition-all duration-300"
										style={{ width: charging ? "36%" : "58%" }}
									/>

									{down && (
										<span
											aria-hidden="true"
											className="fight-landing absolute left-1/2 -bottom-1 h-1 w-16 bg-foreground/30 blur-[1px]"
										/>
									)}

									{charging && (
										<>
											<span
												aria-hidden="true"
												className="fight-dust absolute bottom-0 left-1/3 size-1.5 bg-foreground/30"
												style={
													{
														"--dx": side === "a" ? "-16px" : "16px",
													} as React.CSSProperties
												}
											/>
											<span
												aria-hidden="true"
												className="fight-dust absolute bottom-0 left-1/2 size-1 bg-foreground/25"
												style={
													{
														"--dx": side === "a" ? "-24px" : "24px",
														animationDelay: "120ms",
													} as React.CSSProperties
												}
											/>
										</>
									)}
								</div>
							</div>
						);
					})}

					{phase === "scan" && (
						<div className="absolute inset-0 flex items-center justify-center">
							<span className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-brand">
								compiling combatants…
							</span>
						</div>
					)}

					{banner && (
						<div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
							<span className="fight-banner font-mono text-4xl md:text-6xl font-bold text-brand">
								FIGHT!
							</span>
						</div>
					)}

					{impact && event?.crit && (
						<div
							key={`crit-${step}`}
							className="absolute inset-x-0 top-6 flex justify-center pointer-events-none z-30"
						>
							<span className="fight-float font-mono text-sm md:text-base font-bold tracking-[0.24em] text-[rgb(255,206,84)]">
								CRITICAL
							</span>
						</div>
					)}

					{phase === "done" && (
						<div className="absolute inset-x-0 top-0 flex flex-col items-center gap-1.5 pt-7 pointer-events-none z-40">
							<span className="fight-stamp font-mono text-4xl md:text-6xl font-bold tracking-[0.24em] text-brand drop-shadow-[0_0_18px_rgba(210,86,17,0.6)]">
								{knockedOut ? "K.O." : "TIME"}
							</span>
							<span
								className="text-sm text-foreground"
								style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}
							>
								{knockedOut ? (
									<Trans>
										{winner?.name} wins in {result.events.length} turns
									</Trans>
								) : (
									<Trans>
										{winner?.name} wins on damage after {result.events.length}{" "}
										turns
									</Trans>
								)}
							</span>
							<span
								className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground text-center px-6"
								style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}
							>
								{result.epitaph}
							</span>
						</div>
					)}
				</div>
			</div>

			<CombatLog
				events={result.events.slice(0, phase === "done" ? undefined : step + 1)}
				names={{ a: a?.name ?? "", b: b?.name ?? "" }}
			/>

			{phase === "done" && (
				<>
					<div className="grid grid-cols-2 gap-4 md:gap-10">
						{a && <StatReadout fighter={a} align="left" />}
						{b && <StatReadout fighter={b} align="right" />}
					</div>
					<div className="flex flex-wrap items-center justify-center gap-3">
						<button
							type="button"
							onClick={start}
							className="border border-border px-6 py-2.5 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-foreground hover:border-brand/60 hover:text-brand transition-colors"
						>
							<Trans>rematch</Trans>
						</button>
						<button
							type="button"
							onClick={() => {
								navigator.clipboard
									?.writeText(window.location.href)
									.then(() => setCopied(true))
									.catch(() => setCopied(false));
							}}
							className="border border-brand/70 bg-brand/10 px-6 py-2.5 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-brand hover:bg-brand/20 transition-colors"
						>
							{copied
								? t({ message: "link copied" })
								: t({ message: "copy fight link" })}
						</button>
						<button
							type="button"
							onClick={reset}
							className="border border-border px-6 py-2.5 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
						>
							<Trans>new challengers</Trans>
						</button>
					</div>
				</>
			)}
		</div>
	);
}
