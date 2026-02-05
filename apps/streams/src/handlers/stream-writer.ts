import type { DurableStream } from "@durable-streams/client";
import type { AIDBSessionProtocol } from "../protocol";
import type { StreamChunk } from "../types";

type MessageRole = "user" | "assistant" | "system";

export class StreamWriter {
	constructor(
		private readonly protocol: AIDBSessionProtocol,
		private readonly stream: DurableStream,
		private readonly sessionId: string,
	) {}

	async writeUserMessage(
		messageId: string,
		actorId: string,
		content: string,
		txid?: string,
	): Promise<void> {
		await this.protocol.writeUserMessage(
			this.stream,
			this.sessionId,
			messageId,
			actorId,
			content,
			txid,
		);
	}

	async writeChunk(
		messageId: string,
		actorId: string,
		role: MessageRole,
		chunk: StreamChunk,
		txid?: string,
	): Promise<void> {
		await this.protocol.writeChunk(
			this.stream,
			this.sessionId,
			messageId,
			actorId,
			role,
			chunk,
			txid,
		);
	}

	async writeToolResult(
		messageId: string,
		actorId: string,
		toolCallId: string,
		output: unknown,
		error: string | null,
		txid?: string,
	): Promise<void> {
		await this.protocol.writeToolResult(
			this.stream,
			this.sessionId,
			messageId,
			actorId,
			toolCallId,
			output,
			error,
			txid,
		);
	}

	async writeApprovalResponse(
		actorId: string,
		approvalId: string,
		approved: boolean,
		txid?: string,
	): Promise<void> {
		await this.protocol.writeApprovalResponse(
			this.stream,
			this.sessionId,
			actorId,
			approvalId,
			approved,
			txid,
		);
	}
}

export function createStreamWriter(
	protocol: AIDBSessionProtocol,
	stream: DurableStream,
	sessionId: string,
): StreamWriter {
	return new StreamWriter(protocol, stream, sessionId);
}
