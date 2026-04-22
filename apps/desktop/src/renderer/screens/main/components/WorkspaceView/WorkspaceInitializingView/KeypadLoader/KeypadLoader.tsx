import { cn } from "@superset/ui/utils";
import type { ComponentType } from "react";
import { useEffect, useRef } from "react";
import {
	LuDatabase,
	LuDownload,
	LuFileCog,
	LuGitBranch,
	LuRefreshCw,
} from "react-icons/lu";
import {
	getStepIndex,
	type WorkspaceInitStep,
} from "shared/types/workspace-init";
import clickSoundUrl from "../assets/click.mp3";
import keySingleUrl from "../assets/key-single.png";
import keypadBaseUrl from "../assets/keypad-base.png";
import "./KeypadLoader.css";

type KeyId = "one" | "two" | "three" | "four" | "five";

interface KeyDef {
	id: KeyId;
	/** Key is considered "pressed" once currentStep has advanced past this step. */
	pressedAfter: WorkspaceInitStep;
	/** Steps during which this key should animate as "currently being pressed". */
	activeSteps: readonly WorkspaceInitStep[];
	Icon: ComponentType<{ className?: string }>;
	label: string;
}

// 6 underlying steps are collapsed into 5 keys by merging syncing + verifying.
const KEYS: readonly KeyDef[] = [
	{
		id: "one",
		pressedAfter: "verifying",
		// Include "pending" so the keypad shows immediate activity before the
		// first progress event arrives from the backend.
		activeSteps: ["pending", "syncing", "verifying"],
		Icon: LuRefreshCw,
		label: "Syncing",
	},
	{
		id: "two",
		pressedAfter: "fetching",
		activeSteps: ["fetching"],
		Icon: LuDownload,
		label: "Fetching",
	},
	{
		id: "three",
		pressedAfter: "creating_worktree",
		activeSteps: ["creating_worktree"],
		Icon: LuGitBranch,
		label: "Creating worktree",
	},
	{
		id: "four",
		pressedAfter: "copying_config",
		activeSteps: ["copying_config"],
		Icon: LuFileCog,
		label: "Copying config",
	},
	{
		id: "five",
		pressedAfter: "finalizing",
		activeSteps: ["finalizing"],
		Icon: LuDatabase,
		label: "Finalizing",
	},
];

interface KeypadLoaderProps {
	currentStep: WorkspaceInitStep;
	className?: string;
	muted?: boolean;
}

export function KeypadLoader({
	currentStep,
	className,
	muted = false,
}: KeypadLoaderProps) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const prevStepRef = useRef<WorkspaceInitStep>(currentStep);
	const timeoutsRef = useRef<number[]>([]);

	useEffect(() => {
		if (!audioRef.current) {
			const audio = new Audio(clickSoundUrl);
			audio.volume = 0.35;
			audio.preload = "auto";
			audioRef.current = audio;
		}
		audioRef.current.muted = muted;
	}, [muted]);

	useEffect(() => {
		return () => {
			for (const id of timeoutsRef.current) window.clearTimeout(id);
			timeoutsRef.current = [];
			const audio = audioRef.current;
			if (audio) {
				audio.pause();
				audio.src = "";
				audioRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		const prevStep = prevStepRef.current;
		prevStepRef.current = currentStep;
		if (prevStep === currentStep) return;

		const prevIdx = getStepIndex(prevStep);
		const curIdx = getStepIndex(currentStep);
		if (curIdx <= prevIdx) return;

		// Play one click per key crossed (usually one, but handle step skipping).
		const crossed = KEYS.filter((k) => {
			const t = getStepIndex(k.pressedAfter);
			return prevIdx <= t && curIdx > t;
		});

		if (crossed.length === 0 || muted || !audioRef.current) return;

		const audio = audioRef.current;
		// Cap rapid-fire clicks (e.g. on a huge step skip) to avoid audio spam.
		const clicksToPlay = Math.min(crossed.length, 2);
		for (let i = 0; i < clicksToPlay; i++) {
			const id = window.setTimeout(() => {
				try {
					audio.currentTime = 0;
					void audio.play().catch(() => {});
				} catch {
					// ignore — audio is best-effort
				}
			}, i * 140);
			timeoutsRef.current.push(id);
		}
	}, [currentStep, muted]);

	const currentIdx = getStepIndex(currentStep);

	return (
		<div
			className={cn("keypad-loader", className)}
			role="img"
			aria-label={`Setup in progress: ${
				KEYS.find((k) => k.activeSteps.includes(currentStep))?.label ??
				"Preparing"
			}`}
		>
			<div className="keypad-loader__base">
				<img src={keypadBaseUrl} alt="" />
			</div>
			{KEYS.map(({ id, pressedAfter, activeSteps, Icon }) => {
				const thresholdIdx = getStepIndex(pressedAfter);
				const isPressed = currentIdx > thresholdIdx;
				const isActive = activeSteps.includes(currentStep);
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
