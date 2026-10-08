/**
 * The slice of the OpenAI Realtime protocol this client speaks over the
 * `oai-events` data channel. Anything else arrives typed as `unknown` and is
 * ignored by name.
 */

export type RealtimeMessageRole = "user" | "assistant" | "system";

export type RealtimeConversationItem =
	| {
			type: "message";
			role: RealtimeMessageRole;
			content: Array<{ type: "input_text"; text: string }>;
	  }
	| { type: "function_call_output"; call_id: string; output: string };

export type RealtimeClientEvent =
	| { type: "session.update"; session: Record<string, unknown> }
	| {
			type: "conversation.item.create";
			item: RealtimeConversationItem;
			previous_item_id?: string;
	  }
	| {
			type: "response.create";
			response?: { instructions?: string; conversation?: "none" | "auto" };
	  }
	| { type: "response.cancel"; response_id?: string }
	| { type: "output_audio_buffer.clear" };

export interface RealtimeFunctionCallDone {
	type: "response.function_call_arguments.done";
	response_id: string;
	item_id: string;
	call_id: string;
	name: string;
	arguments: string;
}

export interface RealtimeResponseDone {
	type: "response.done";
	response: {
		id: string;
		status: "completed" | "cancelled" | "failed" | "incomplete" | string;
		status_details?: {
			type?: string;
			error?: { code?: string; message?: string };
		};
		output?: Array<{ type: string; call_id?: string; name?: string }>;
	};
}

export type RealtimeServerEvent =
	| { type: "session.created" }
	| { type: "session.updated" }
	| {
			type: "error";
			error: { type?: string; code?: string | null; message: string };
	  }
	| { type: "input_audio_buffer.speech_started"; item_id: string }
	| { type: "input_audio_buffer.speech_stopped"; item_id: string }
	| {
			type: "conversation.item.input_audio_transcription.delta";
			item_id: string;
			delta: string;
	  }
	| {
			type: "conversation.item.input_audio_transcription.completed";
			item_id: string;
			transcript: string;
	  }
	| { type: "response.created"; response: { id: string } }
	| {
			type: "response.output_audio_transcript.delta";
			response_id: string;
			item_id: string;
			delta: string;
	  }
	| {
			type: "response.output_audio_transcript.done";
			response_id: string;
			item_id: string;
			transcript: string;
	  }
	| RealtimeFunctionCallDone
	| RealtimeResponseDone
	| { type: "output_audio_buffer.started"; response_id: string }
	| { type: "output_audio_buffer.stopped"; response_id: string }
	| { type: "output_audio_buffer.cleared"; response_id: string };

export function parseServerEvent(raw: string): RealtimeServerEvent | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			typeof (parsed as { type?: unknown }).type === "string"
		) {
			return parsed as RealtimeServerEvent;
		}
	} catch {
		// A frame that is not JSON is not an event.
	}
	return null;
}
