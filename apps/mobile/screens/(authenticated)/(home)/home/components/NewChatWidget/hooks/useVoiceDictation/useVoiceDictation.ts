import {
	ExpoSpeechRecognitionModule,
	useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useRef, useState } from "react";
import { Alert } from "react-native";

export type VoiceDictation =
	| { status: "idle"; start: () => Promise<void> }
	| { status: "recording"; startedAt: number; stop: () => void }
	| { status: "finalizing" };

type DictationPhase =
	| { status: "idle" }
	| { status: "recording"; startedAt: number }
	| { status: "finalizing" };

const FINALIZE_TIMEOUT_MS = 15_000;
const SETTLE_GRACE_MS = 500;

export function useVoiceDictation(draft: {
	read: () => string;
	write: (text: string) => void;
}): VoiceDictation {
	const [phase, setPhase] = useState<DictationPhase>({ status: "idle" });
	const phaseRef = useRef(phase);
	phaseRef.current = phase;
	const transcriptRef = useRef<string | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const settle = (transcript: string | null) => {
		if (phaseRef.current.status === "idle") return;
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
		phaseRef.current = { status: "idle" };
		setPhase({ status: "idle" });
		const trimmed = transcript?.trim();
		if (!trimmed) return;
		const base = draft.read().trimEnd();
		draft.write(base ? `${base} ${trimmed}` : trimmed);
	};

	const armFinalizeTimeout = () => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		timeoutRef.current = setTimeout(
			() => settle(transcriptRef.current),
			FINALIZE_TIMEOUT_MS,
		);
	};

	useSpeechRecognitionEvent("result", (event) => {
		if (phaseRef.current.status === "idle") return;
		if (!event.isFinal) return;
		transcriptRef.current = event.results[0]?.transcript ?? null;
		settle(transcriptRef.current);
	});

	useSpeechRecognitionEvent("audioend", () => {
		if (phaseRef.current.status === "idle") return;
		setTimeout(() => settle(transcriptRef.current), SETTLE_GRACE_MS);
	});

	useSpeechRecognitionEvent("end", () => {
		if (phaseRef.current.status !== "recording") return;
		armFinalizeTimeout();
		setPhase({ status: "finalizing" });
	});

	useSpeechRecognitionEvent("error", (event) => {
		if (phaseRef.current.status === "idle") return;
		if (
			event.error === "not-allowed" ||
			event.error === "service-not-allowed"
		) {
			settle(null);
			Alert.alert("Microphone access is not allowed");
			return;
		}
		if (phaseRef.current.status === "recording") {
			armFinalizeTimeout();
			setPhase({ status: "finalizing" });
		}
	});

	const start = async () => {
		const permission =
			await ExpoSpeechRecognitionModule.requestPermissionsAsync();
		if (!permission.granted) {
			Alert.alert("Microphone access is not allowed");
			return;
		}
		transcriptRef.current = null;
		setPhase({ status: "recording", startedAt: Date.now() });
		ExpoSpeechRecognitionModule.start({
			continuous: true,
			interimResults: false,
			volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
		});
	};

	const stop = () => {
		armFinalizeTimeout();
		setPhase({ status: "finalizing" });
		ExpoSpeechRecognitionModule.stop();
	};

	if (phase.status === "recording") {
		return { status: "recording", startedAt: phase.startedAt, stop };
	}
	if (phase.status === "finalizing") {
		return { status: "finalizing" };
	}
	return { status: "idle", start };
}
