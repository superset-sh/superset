import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { VoiceActivationTarget } from "../../types";

export type VoiceDictationPhase =
	| "idle"
	| "starting"
	| "listening"
	| "processing"
	| "success"
	| "error";

export type VoiceDictationState = {
	phase: VoiceDictationPhase;
	targetLabel?: string;
	message?: string;
	interimTranscript?: string;
};

export type VoiceDictationTarget = {
	kind: VoiceActivationTarget;
	label: string;
	insertTranscript: (text: string) => boolean | Promise<boolean>;
};

type ActiveVoiceSession = {
	target: VoiceDictationTarget;
	recorder: MediaRecorder;
	stream: MediaStream;
	chunks: Blob[];
	mimeType: string;
	endedWithError: boolean;
	autoStopTimer: ReturnType<typeof setTimeout> | null;
};

type MediaRecorderErrorEvent = Event & {
	error?: {
		message?: string;
		name?: string;
	};
};

const SUCCESS_VISIBLE_MS = 1400;
const ERROR_VISIBLE_MS = 5000;
const MAX_RECORDING_MS = 60_000;
const PREFERRED_MIME_TYPES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4",
	"audio/mpeg",
	"audio/wav",
];

function getPreferredMimeType(): string | undefined {
	if (typeof MediaRecorder === "undefined") return undefined;
	if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;
	return PREFERRED_MIME_TYPES.find((mimeType) =>
		MediaRecorder.isTypeSupported(mimeType),
	);
}

function normalizeTranscript(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function stopStream(stream: MediaStream): void {
	for (const track of stream.getTracks()) {
		track.stop();
	}
}

function messageForCaptureError(error: unknown): string {
	if (error instanceof DOMException) {
		if (
			error.name === "NotAllowedError" ||
			error.name === "SecurityError" ||
			error.name === "PermissionDeniedError"
		) {
			return "Microphone access is blocked for Voice Control.";
		}
		if (
			error.name === "NotFoundError" ||
			error.name === "DevicesNotFoundError"
		) {
			return "No microphone was detected.";
		}
		if (error.name === "NotReadableError" || error.name === "TrackStartError") {
			return "The microphone is already in use.";
		}
	}

	if (error instanceof Error && error.message.trim()) {
		return error.message.trim();
	}

	return "Voice recording failed.";
}

function messageForTranscriptionError(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message.trim();
	}
	return "Voice dictation failed.";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunkSize = 0x8000;

	for (let index = 0; index < bytes.length; index += chunkSize) {
		const chunk = bytes.subarray(index, index + chunkSize);
		binary += String.fromCharCode(...chunk);
	}

	return window.btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
	return arrayBufferToBase64(await blob.arrayBuffer());
}

export function useVoiceDictation() {
	const [state, setState] = useState<VoiceDictationState>({ phase: "idle" });
	const activeSessionRef = useRef<ActiveVoiceSession | null>(null);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const startPendingRef = useRef(false);
	const stopAfterStartRef = useRef(false);
	const transcribeMutation = electronTrpc.voiceInput.transcribe.useMutation();

	const clearHideTimer = useCallback(() => {
		if (hideTimerRef.current) {
			clearTimeout(hideTimerRef.current);
			hideTimerRef.current = null;
		}
	}, []);

	const hideAfter = useCallback(
		(delay: number) => {
			clearHideTimer();
			hideTimerRef.current = setTimeout(() => {
				activeSessionRef.current = null;
				setState({ phase: "idle" });
				hideTimerRef.current = null;
			}, delay);
		},
		[clearHideTimer],
	);

	const clearSessionTimer = useCallback((session: ActiveVoiceSession) => {
		if (session.autoStopTimer) {
			clearTimeout(session.autoStopTimer);
			session.autoStopTimer = null;
		}
	}, []);

	const cleanupSession = useCallback(
		(session: ActiveVoiceSession) => {
			clearSessionTimer(session);
			stopStream(session.stream);
		},
		[clearSessionTimer],
	);

	const showError = useCallback(
		(message: string) => {
			startPendingRef.current = false;
			stopAfterStartRef.current = false;
			const activeSession = activeSessionRef.current;
			if (activeSession) {
				cleanupSession(activeSession);
			}
			activeSessionRef.current = null;
			console.error("[voice-input] Dictation failed:", message);
			setState({ phase: "error", message });
			hideAfter(ERROR_VISIBLE_MS);
		},
		[cleanupSession, hideAfter],
	);

	const finishSession = useCallback(
		async (session: ActiveVoiceSession) => {
			startPendingRef.current = false;
			stopAfterStartRef.current = false;
			if (activeSessionRef.current === session) {
				activeSessionRef.current = null;
			}
			cleanupSession(session);

			const audioBlob = new Blob(session.chunks, {
				type: session.mimeType || session.chunks[0]?.type || "audio/webm",
			});
			if (audioBlob.size === 0) {
				showError("No audio was captured.");
				return;
			}

			setState({
				phase: "processing",
				targetLabel: session.target.label,
				message: "Transcribing dictation",
			});

			try {
				const result = await transcribeMutation.mutateAsync({
					audioBase64: await blobToBase64(audioBlob),
					mimeType: audioBlob.type || "audio/webm",
				});
				const transcript = normalizeTranscript(result.text);
				if (!transcript) {
					showError("No speech detected.");
					return;
				}

				const inserted = await session.target.insertTranscript(transcript);
				if (!inserted) {
					showError(
						`Voice Control could not write to ${session.target.label}.`,
					);
					return;
				}

				setState({
					phase: "success",
					targetLabel: session.target.label,
					message: "Dictation inserted",
				});
				hideAfter(SUCCESS_VISIBLE_MS);
			} catch (error) {
				showError(messageForTranscriptionError(error));
			}
		},
		[cleanupSession, hideAfter, showError, transcribeMutation],
	);

	const stop = useCallback(() => {
		const activeSession = activeSessionRef.current;
		if (!activeSession) {
			if (startPendingRef.current) {
				stopAfterStartRef.current = true;
				return true;
			}
			return false;
		}

		setState({
			phase: "processing",
			targetLabel: activeSession.target.label,
			message: "Processing dictation",
		});
		clearSessionTimer(activeSession);

		try {
			if (activeSession.recorder.state === "inactive") {
				void finishSession(activeSession);
			} else {
				activeSession.recorder.stop();
			}
			return true;
		} catch (error) {
			showError(messageForCaptureError(error));
			return false;
		}
	}, [clearSessionTimer, finishSession, showError]);

	const start = useCallback(
		async (target: VoiceDictationTarget) => {
			if (!navigator.mediaDevices?.getUserMedia) {
				showError("Voice recording is not available in this Electron runtime.");
				return false;
			}
			if (typeof MediaRecorder === "undefined") {
				showError("Voice recording is not available in this Electron runtime.");
				return false;
			}

			clearHideTimer();
			startPendingRef.current = true;
			stopAfterStartRef.current = false;
			setState({
				phase: "starting",
				targetLabel: target.label,
				message: "Starting microphone",
			});

			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
					},
				});
				const mimeType = getPreferredMimeType();
				const recorder = mimeType
					? new MediaRecorder(stream, { mimeType })
					: new MediaRecorder(stream);
				const session: ActiveVoiceSession = {
					target,
					recorder,
					stream,
					chunks: [],
					mimeType: recorder.mimeType || mimeType || "audio/webm",
					endedWithError: false,
					autoStopTimer: null,
				};

				recorder.onstart = () => {
					setState({
						phase: "listening",
						targetLabel: target.label,
						message: "Recording - release shortcut to finish",
					});
				};
				recorder.ondataavailable = (event) => {
					if (event.data.size > 0) {
						session.chunks.push(event.data);
					}
				};
				recorder.onerror = (event: Event) => {
					if (activeSessionRef.current !== session) return;
					session.endedWithError = true;
					const recorderError = event as MediaRecorderErrorEvent;
					showError(
						recorderError.error?.message?.trim() || "Voice recording failed.",
					);
				};
				recorder.onstop = () => {
					if (activeSessionRef.current !== session || session.endedWithError) {
						return;
					}
					void finishSession(session);
				};

				activeSessionRef.current = session;
				recorder.start(250);
				startPendingRef.current = false;
				if (stopAfterStartRef.current) {
					stopAfterStartRef.current = false;
					setTimeout(() => {
						if (activeSessionRef.current === session) {
							stop();
						}
					}, 0);
				}
				session.autoStopTimer = setTimeout(() => {
					if (activeSessionRef.current === session) {
						stop();
					}
				}, MAX_RECORDING_MS);
				return true;
			} catch (error) {
				startPendingRef.current = false;
				stopAfterStartRef.current = false;
				showError(messageForCaptureError(error));
				return false;
			}
		},
		[clearHideTimer, finishSession, showError, stop],
	);

	const toggle = useCallback(
		async (target: VoiceDictationTarget) => {
			if (activeSessionRef.current) {
				return stop();
			}
			return start(target);
		},
		[start, stop],
	);

	useEffect(() => {
		return () => {
			clearHideTimer();
			const activeSession = activeSessionRef.current;
			startPendingRef.current = false;
			stopAfterStartRef.current = false;
			if (!activeSession) return;
			cleanupSession(activeSession);
			if (activeSession.recorder.state !== "inactive") {
				activeSession.recorder.stop();
			}
			activeSessionRef.current = null;
		};
	}, [cleanupSession, clearHideTimer]);

	return {
		state,
		start,
		stop,
		toggle,
		showError,
	};
}
