import { cn } from "@superset/ui/utils";
import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	LuDatabase,
	LuDownload,
	LuFileCog,
	LuGitBranch,
	LuRefreshCw,
} from "react-icons/lu";
import clickSoundUrl from "./assets/click.mp3";
import keySingleUrl from "./assets/key-single.png";
import keypadBaseUrl from "./assets/keypad-base.png";
import "./KeypadLoader.css";

const KEY_IDS = ["one", "two", "three", "four", "five"] as const;

type StepStatus = "pending" | "active" | "done";

export interface ProgressStep {
	id: string;
	label: string;
	status: StepStatus;
}

type IconComponent = ComponentType<{ className?: string }>;

// Fixed 5-key layout matches the keypad-base.png artwork. Keys map positionally
// to `steps[0..4]` — callers are expected to emit all five positions (using a
// "pending" placeholder for steps that are skipped at runtime, e.g. a local-only
// fetch), so each key always has a home.
const DEFAULT_ICONS: readonly IconComponent[] = [
	LuRefreshCw,
	LuGitBranch,
	LuDownload,
	LuFileCog,
	LuDatabase,
];

interface KeypadLoaderProps {
	steps: ProgressStep[];
	/** Icons per key position. Defaults to refresh/branch/download/config/db. */
	icons?: ReadonlyArray<IconComponent>;
	className?: string;
	muted?: boolean;
	/** 0–1 click-sound volume. Clamped and ignored if muted. */
	volume?: number;
}

const DEFAULT_CLICK_VOLUME = 0.35;

export function KeypadLoader({
	steps,
	icons = DEFAULT_ICONS,
	className,
	muted = false,
	volume = DEFAULT_CLICK_VOLUME,
}: KeypadLoaderProps) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [reducedMotion, setReducedMotion] = useState(false);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReducedMotion(mq.matches);
		const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	const effectiveMuted = muted || reducedMotion;
	const clampedVolume = Math.max(0, Math.min(1, volume));

	useEffect(() => {
		if (!audioRef.current) {
			const audio = new Audio(clickSoundUrl);
			audio.preload = "auto";
			audioRef.current = audio;
		}
		audioRef.current.muted = effectiveMuted;
		audioRef.current.volume = clampedVolume;
	}, [effectiveMuted, clampedVolume]);

	useEffect(() => {
		return () => {
			const audio = audioRef.current;
			if (audio) {
				audio.pause();
				audio.src = "";
				audioRef.current = null;
			}
		};
	}, []);

	const doneCount = useMemo(
		() =>
			steps
				.slice(0, KEY_IDS.length)
				.reduce((n, s) => n + (s.status === "done" ? 1 : 0), 0),
		[steps],
	);
	const prevDoneCountRef = useRef(doneCount);

	useEffect(() => {
		const prev = prevDoneCountRef.current;
		prevDoneCountRef.current = doneCount;
		if (doneCount <= prev) return;
		if (effectiveMuted || !audioRef.current) return;

		const clicksToPlay = Math.min(doneCount - prev, 2);
		const scheduled: number[] = [];
		for (let i = 0; i < clicksToPlay; i++) {
			const id = window.setTimeout(() => {
				try {
					const current = audioRef.current;
					if (!current || current.muted) return;
					const player = current.cloneNode() as HTMLAudioElement;
					player.volume = clampedVolume;
					void player.play().catch(() => {});
				} catch {
					// ignore — audio is best-effort
				}
			}, i * 140);
			scheduled.push(id);
		}

		return () => {
			for (const id of scheduled) window.clearTimeout(id);
		};
	}, [doneCount, effectiveMuted, clampedVolume]);

	const activeLabel = steps.find((s) => s.status === "active")?.label;

	return (
		<div
			className={cn("keypad-loader", className)}
			role="img"
			aria-label={`Setup in progress${activeLabel ? `: ${activeLabel}` : ""}`}
		>
			<div className="keypad-loader__base">
				<img src={keypadBaseUrl} alt="" />
			</div>
			{KEY_IDS.map((id, idx) => {
				const step = steps[idx];
				const Icon = icons[idx];
				if (!Icon) return null;
				const isPressed = step?.status === "done";
				const isActive = step?.status === "active";
				return (
					<div
						key={id}
						className={`keypad-loader__key keypad-loader__key--${id}`}
						data-pressed={isPressed ? "true" : undefined}
						data-active={isActive ? "true" : undefined}
					>
						<span className="keypad-loader__mask">
							<span className="keypad-loader__content">
								<span className="keypad-loader__text">
									<Icon />
								</span>
								<img src={keySingleUrl} alt="" />
							</span>
						</span>
					</div>
				);
			})}
		</div>
	);
}
