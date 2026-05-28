import { cn } from "@superset/ui/utils";
import {
	AlertCircleIcon,
	CheckIcon,
	LoaderCircleIcon,
	MicIcon,
} from "lucide-react";
import type { VoiceDictationState } from "../../hooks/useVoiceDictation";

type VoiceDictationIndicatorProps = {
	state: VoiceDictationState;
};

function getIndicatorTone(state: VoiceDictationState) {
	if (state.phase === "error") {
		return {
			icon: AlertCircleIcon,
			className:
				"border-destructive/30 bg-destructive/95 text-destructive-foreground",
		};
	}
	if (state.phase === "success") {
		return {
			icon: CheckIcon,
			className: "border-emerald-500/30 bg-emerald-600 text-white",
		};
	}
	if (state.phase === "processing" || state.phase === "starting") {
		return {
			icon: LoaderCircleIcon,
			className: "border-amber-400/30 bg-amber-500 text-amber-950",
			spin: true,
		};
	}
	return {
		icon: MicIcon,
		className: "border-sky-400/30 bg-sky-600 text-white",
		pulse: true,
	};
}

export function VoiceDictationIndicator({
	state,
}: VoiceDictationIndicatorProps) {
	if (state.phase === "idle") return null;

	const tone = getIndicatorTone(state);
	const Icon = tone.icon;
	const label = state.message ?? "Voice Control";
	const target = state.targetLabel ? ` - ${state.targetLabel}` : "";

	return (
		<output
			className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-3"
			aria-live="polite"
			data-testid="voice-dictation-indicator"
		>
			<div
				className={cn(
					"flex max-w-[min(520px,calc(100vw-32px))] min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-lg shadow-black/20",
					tone.className,
				)}
			>
				<span className="relative flex size-4 shrink-0 items-center justify-center">
					{tone.pulse ? (
						<span className="absolute inline-flex size-3 animate-ping rounded-full bg-white/60" />
					) : null}
					<Icon className={cn("size-4", tone.spin && "animate-spin")} />
				</span>
				<span className="min-w-0 truncate whitespace-nowrap">
					{label}
					{target}
				</span>
				{state.interimTranscript ? (
					<span className="min-w-0 truncate border-l border-current/25 pl-2 font-normal opacity-90">
						{state.interimTranscript}
					</span>
				) : null}
			</div>
		</output>
	);
}
