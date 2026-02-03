import { useCallback, useRef, useState } from "react";
import { getAuthToken } from "renderer/lib/auth-client";
import { env } from "renderer/env.renderer";

type PipelineStatus =
	| "idle"
	| "transcribing"
	| "processing"
	| "streaming"
	| "done"
	| "error";

interface ToolCall {
	toolName: string;
	toolInput?: unknown;
	result?: string;
}

interface VoicePipelineState {
	status: PipelineStatus;
	transcription: string | null;
	toolCalls: ToolCall[];
	responseText: string;
	error: string | null;
}

const INITIAL_STATE: VoicePipelineState = {
	status: "idle",
	transcription: null,
	toolCalls: [],
	responseText: "",
	error: null,
};

export function useVoicePipeline() {
	const [state, setState] = useState<VoicePipelineState>(INITIAL_STATE);
	const abortRef = useRef<AbortController | null>(null);

	const processAudio = useCallback(async (audioB64: string) => {
		abortRef.current?.abort();
		setState({ ...INITIAL_STATE, status: "transcribing" });

		const binaryStr = atob(audioB64);
		const bytes = new Uint8Array(binaryStr.length);
		for (let i = 0; i < binaryStr.length; i++) {
			bytes[i] = binaryStr.charCodeAt(i);
		}

		const formData = new FormData();
		formData.append(
			"audio",
			new Blob([bytes], { type: "audio/wav" }),
			"audio.wav",
		);

		const abortController = new AbortController();
		abortRef.current = abortController;

		try {
			const headers: HeadersInit = {};
			const token = getAuthToken();
			if (token) {
				headers.Authorization = `Bearer ${token}`;
			}

			const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/voice`, {
				method: "POST",
				body: formData,
				credentials: "include",
				headers,
				signal: abortController.signal,
			});

			if (!response.ok) {
				const text = await response.text();
				setState((prev) => ({
					...prev,
					status: "error",
					error: `API error: ${response.status} ${text}`,
				}));
				return;
			}

			if (!response.body) {
				setState((prev) => ({
					...prev,
					status: "error",
					error: "No response body",
				}));
				return;
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				let eventType = "";
				for (const line of lines) {
					if (line.startsWith("event: ")) {
						eventType = line.slice(7).trim();
					} else if (line.startsWith("data: ") && eventType) {
						try {
							handleSSEEvent(eventType, JSON.parse(line.slice(6)));
						} catch {
							// Skip malformed data
						}
						eventType = "";
					}
				}
			}

			setState((prev) =>
				prev.status !== "error" ? { ...prev, status: "done" } : prev,
			);
		} catch (error) {
			if (abortController.signal.aborted) return;
			setState((prev) => ({
				...prev,
				status: "error",
				error: error instanceof Error ? error.message : "Request failed",
			}));
		}
	}, []);

	const abort = useCallback(() => {
		abortRef.current?.abort();
		setState((prev) =>
			prev.status !== "error" &&
			prev.status !== "done" &&
			prev.status !== "idle"
				? { ...prev, status: "done" }
				: prev,
		);
	}, []);

	function handleSSEEvent(event: string, data: Record<string, unknown>) {
		switch (event) {
			case "transcription":
				setState((prev) => ({
					...prev,
					status: "processing",
					transcription: data.text as string,
				}));
				break;
			case "tool_use":
				setState((prev) => ({
					...prev,
					status: "processing",
					toolCalls: [
						...prev.toolCalls,
						{ toolName: data.toolName as string, toolInput: data.toolInput },
					],
				}));
				break;
			case "tool_result":
				setState((prev) => ({
					...prev,
					toolCalls: prev.toolCalls.map((tc) =>
						tc.toolName === data.toolName && !tc.result
							? { ...tc, result: data.result as string }
							: tc,
					),
				}));
				break;
			case "text_delta":
				setState((prev) => ({
					...prev,
					status: "streaming",
					responseText: prev.responseText + (data.delta as string),
				}));
				break;
			case "done":
				setState((prev) => ({ ...prev, status: "done" }));
				break;
			case "error":
				setState((prev) => ({
					...prev,
					status: "error",
					error: data.message as string,
				}));
				break;
		}
	}

	return { ...state, processAudio, abort };
}
