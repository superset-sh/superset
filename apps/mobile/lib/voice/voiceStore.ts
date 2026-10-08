import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	VOICE_DEFAULT_REASONING_EFFORT,
	VOICE_DEFAULT_SPEED,
	VOICE_DEFAULT_VOICE,
	type VoiceReasoningEffort,
	type VoiceVoice,
} from "@superset/shared/voice";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type VoiceStatus =
	| "idle"
	| "connecting"
	| "listening"
	| "thinking"
	| "speaking"
	| "reconnecting"
	| "ended";

export type ToolActivityStatus = "running" | "done" | "failed";

export type TranscriptEntry =
	| { id: string; role: "user" | "assistant"; text: string; final: boolean }
	| {
			id: string;
			role: "tool";
			name: string;
			/** What it acted on, e.g. a workspace name; the UI words the rest. */
			subject: string | null;
			status: ToolActivityStatus;
	  };

const MAX_TRANSCRIPT = 200;

export interface VoiceState {
	status: VoiceStatus;
	muted: boolean;
	/** The model may speak up when an agent's status changes. */
	proactive: boolean;
	voice: VoiceVoice;
	reasoningEffort: VoiceReasoningEffort;
	speed: number;
	transcript: TranscriptEntry[];
	/** What the model is looking at, for the docked pill. */
	focusLabel: string | null;
	error: string | null;
	startedAt: number | null;

	setStatus: (status: VoiceStatus) => void;
	setMuted: (muted: boolean) => void;
	setProactive: (proactive: boolean) => void;
	setVoice: (voice: VoiceVoice) => void;
	setReasoningEffort: (reasoningEffort: VoiceReasoningEffort) => void;
	setSpeed: (speed: number) => void;
	upsertSpeech: (
		id: string,
		role: "user" | "assistant",
		text: string,
		final: boolean,
	) => void;
	addTool: (id: string, name: string, subject: string | null) => void;
	settleTool: (
		id: string,
		status: Exclude<ToolActivityStatus, "running">,
	) => void;
	setFocusLabel: (label: string | null) => void;
	setError: (error: string | null) => void;
	begin: (startedAt: number) => void;
	reset: () => void;
}

const SESSION_DEFAULTS = {
	status: "idle" as VoiceStatus,
	muted: false,
	transcript: [] as TranscriptEntry[],
	focusLabel: null,
	error: null,
	startedAt: null,
};

export const useVoiceStore = create<VoiceState>()(
	persist(
		(set) => ({
			...SESSION_DEFAULTS,
			proactive: false,
			voice: VOICE_DEFAULT_VOICE,
			reasoningEffort: VOICE_DEFAULT_REASONING_EFFORT,
			speed: VOICE_DEFAULT_SPEED,

			setStatus: (status) => set({ status }),
			setMuted: (muted) => set({ muted }),
			setProactive: (proactive) => set({ proactive }),
			setVoice: (voice) => set({ voice }),
			setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
			setSpeed: (speed) => set({ speed }),
			upsertSpeech: (id, role, text, final) =>
				set((state) => {
					const index = state.transcript.findIndex((entry) => entry.id === id);
					const entry = { id, role, text, final };
					if (index === -1) {
						return {
							transcript: [...state.transcript, entry].slice(-MAX_TRANSCRIPT),
						};
					}
					const transcript = state.transcript.slice();
					transcript[index] = entry;
					return { transcript };
				}),
			addTool: (id, name, subject) =>
				set((state) => {
					const entry: TranscriptEntry = {
						id,
						role: "tool",
						name,
						subject,
						status: "running",
					};
					return {
						transcript: [...state.transcript, entry].slice(-MAX_TRANSCRIPT),
					};
				}),
			settleTool: (id, status) =>
				set((state) => ({
					transcript: state.transcript.map((entry) =>
						entry.id === id && entry.role === "tool"
							? { ...entry, status }
							: entry,
					),
				})),
			setFocusLabel: (focusLabel) => set({ focusLabel }),
			setError: (error) => set({ error }),
			begin: (startedAt) =>
				set({
					...SESSION_DEFAULTS,
					status: "connecting",
					startedAt,
				}),
			reset: () => set({ ...SESSION_DEFAULTS }),
		}),
		{
			name: "voice-v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (state) => ({
				proactive: state.proactive,
				voice: state.voice,
				reasoningEffort: state.reasoningEffort,
				speed: state.speed,
			}),
		},
	),
);

export type VoiceStoreApi = typeof useVoiceStore;

export function isVoiceActive(status: VoiceStatus): boolean {
	return status !== "idle" && status !== "ended";
}

export function useVoiceActive(): boolean {
	return useVoiceStore((state) => isVoiceActive(state.status));
}
