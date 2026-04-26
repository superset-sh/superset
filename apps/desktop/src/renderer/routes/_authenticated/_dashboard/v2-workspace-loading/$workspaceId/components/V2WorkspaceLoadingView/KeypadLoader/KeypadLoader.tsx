import { cn } from "@superset/ui/utils";
import type { ComponentType } from "react";
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
import keySingleUrl from "../assets/key-single.png";
import keypadBaseUrl from "../assets/keypad-base.png";
import "./KeypadLoader.css";

type KeyId = "one" | "two" | "three" | "four" | "five";

interface KeyDef {
	id: KeyId;
	pressedAfter: WorkspaceInitStep;
	activeSteps: readonly WorkspaceInitStep[];
	Icon: ComponentType<{ className?: string }>;
	label: string;
}

const KEYS: readonly KeyDef[] = [
	{
		id: "one",
		pressedAfter: "verifying",
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
}

export function KeypadLoader({ currentStep, className }: KeypadLoaderProps) {
	const currentIdx = getStepIndex(currentStep);

	return (
		<div
			className={cn("keypad-loader", className)}
			role="img"
			aria-label={`Loading workspace: ${
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
