import {
	ExpoSpeechRecognitionModule,
	useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useEffect, useRef, useState } from "react";
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

export function useVoiceDictation(draft: {
	read: () => string;
	write: (text: string) => void;
}): VoiceDictation {
	const [phase, setPhase] = useState<DictationPhase>({ status: "idle" });
	const phaseRef = useRef(phase);
	phaseRef.current = phase;
	const transcriptRef = useRef<string | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearBackstop = () => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	};

	const settle = (transcript: string | null) => {
		if (phaseRef.current.status === "idle") return;
		const wasRecording = phaseRef.current.status === "recording";
		clearBackstop();
		phaseRef.current = { status: "idle" };
		setPhase({ status: "idle" });
		if (wasRecording) ExpoSpeechRecognitionModule.stop();
		const trimmed = transcript?.trim();
		if (!trimmed) return;
		const base = draft.read().trimEnd();
		draft.write(base ? `${base} ${trimmed}` : trimmed);
	};

	const armBackstop = () => {
		clearBackstop();
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

	// The recognizer's own task end is authoritative: no more results can
	// arrive after it, in any phase.
	useSpeechRecognitionEvent("end", () => {
		settle(transcriptRef.current);
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
		settle(transcriptRef.current);
	});

	useEffect(
		() => () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			if (phaseRef.current.status !== "idle") {
				ExpoSpeechRecognitionModule.abort();
			}
		},
		[],
	);

	const start = async () => {
		const permission =
			await ExpoSpeechRecognitionModule.requestPermissionsAsync();
		if (!permission.granted) {
			Alert.alert("Microphone access is not allowed");
			return;
		}
		clearBackstop();
		transcriptRef.current = null;
		setPhase({ status: "recording", startedAt: Date.now() });
		ExpoSpeechRecognitionModule.start({
			continuous: true,
			interimResults: false,
			volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
		});
	};

	const stop = () => {
		armBackstop();
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
