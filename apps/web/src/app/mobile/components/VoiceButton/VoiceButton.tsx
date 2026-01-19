"use client";

import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";

import {
	createSpeechRecognizer,
	isSpeechRecognitionSupported,
	type SpeechRecognizer,
} from "@/lib/voice";

export type VoiceTarget = "terminal" | "claude" | "task";

interface VoiceButtonProps {
	onTranscript: (transcript: string, target: VoiceTarget) => void;
	target: VoiceTarget;
	disabled?: boolean;
	className?: string;
}

export function VoiceButton({
	onTranscript,
	target,
	disabled,
	className,
}: VoiceButtonProps) {
	const [isListening, setIsListening] = useState(false);
	const [transcript, setTranscript] = useState("");
	const [interimTranscript, setInterimTranscript] = useState("");
	const [isSupported, setIsSupported] = useState(true);

	const recognizerRef = useRef<SpeechRecognizer | null>(null);
	const finalTranscriptRef = useRef("");

	useEffect(() => {
		setIsSupported(isSpeechRecognitionSupported());
	}, []);

	const startListening = useCallback(() => {
		if (disabled || !isSupported) return;

		finalTranscriptRef.current = "";
		setTranscript("");
		setInterimTranscript("");

		const recognizer = createSpeechRecognizer(
			{
				continuous: true,
				interimResults: true,
				language: "en-US",
			},
			{
				onStart: () => {
					setIsListening(true);
				},
				onEnd: () => {
					setIsListening(false);
					// Submit the final transcript
					if (finalTranscriptRef.current.trim()) {
						onTranscript(finalTranscriptRef.current.trim(), target);
					}
				},
				onResult: ({ transcript: text, isFinal }) => {
					if (isFinal) {
						finalTranscriptRef.current += text + " ";
						setTranscript(finalTranscriptRef.current);
						setInterimTranscript("");
					} else {
						setInterimTranscript(text);
					}
				},
				onError: (error) => {
					console.error("[voice] Recognition error:", error);
					setIsListening(false);
				},
			},
		);

		recognizerRef.current = recognizer;
		recognizer.start();
	}, [disabled, isSupported, onTranscript, target]);

	const stopListening = useCallback(() => {
		if (recognizerRef.current) {
			recognizerRef.current.stop();
			recognizerRef.current = null;
		}
	}, []);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			startListening();
		},
		[startListening],
	);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			stopListening();
		},
		[stopListening],
	);

	const handlePointerLeave = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			if (isListening) {
				stopListening();
			}
		},
		[isListening, stopListening],
	);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (recognizerRef.current) {
				recognizerRef.current.abort();
			}
		};
	}, []);

	if (!isSupported) {
		return (
			<div className="text-center text-sm text-white/50">
				Voice input is not supported in this browser.
			</div>
		);
	}

	const displayTranscript = transcript + interimTranscript;

	return (
		<div className={cn("flex flex-col items-center gap-4", className)}>
			{/* Transcript display */}
			{displayTranscript && (
				<div className="w-full rounded-lg bg-white/5 p-3">
					<p className="text-sm text-white">
						{transcript}
						<span className="text-white/50">{interimTranscript}</span>
					</p>
				</div>
			)}

			{/* Voice button */}
			<button
				type="button"
				onPointerDown={handlePointerDown}
				onPointerUp={handlePointerUp}
				onPointerLeave={handlePointerLeave}
				onPointerCancel={handlePointerLeave}
				disabled={disabled}
				className={cn(
					"relative flex h-20 w-20 items-center justify-center rounded-full transition-all",
					"touch-none select-none",
					isListening
						? "bg-red-500 scale-110"
						: "bg-white/10 hover:bg-white/20 active:scale-95",
					disabled && "cursor-not-allowed opacity-50",
				)}
			>
				<MicrophoneIcon
					className={cn(
						"h-8 w-8 transition-colors",
						isListening ? "text-white" : "text-white/70",
					)}
				/>

				{/* Pulse animation when listening */}
				{isListening && (
					<>
						<span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-30" />
						<span className="absolute inset-0 animate-pulse rounded-full bg-red-500 opacity-20" />
					</>
				)}
			</button>

			{/* Instructions */}
			<p className="text-center text-sm text-white/50">
				{isListening
					? "Release to send"
					: `Hold to speak to ${target === "terminal" ? "Terminal" : target === "claude" ? "Claude" : "create a Task"}`}
			</p>
		</div>
	);
}

function MicrophoneIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
			<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
			<line x1="12" x2="12" y1="19" y2="22" />
		</svg>
	);
}
