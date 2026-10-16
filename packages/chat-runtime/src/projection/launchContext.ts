import {
	type ChatLaunchContext,
	chatLaunchContextSchema,
} from "@superset/chat/protocol";
import { eq } from "drizzle-orm";
import type { ChatDb, ChatSessionRow } from "../db";
import { chatSessionsLocal } from "../db";

export function readLaunchContext(
	row: ChatSessionRow,
): ChatLaunchContext | null {
	if (row.launchContextJson === null) return null;
	try {
		return chatLaunchContextSchema.parse(JSON.parse(row.launchContextJson));
	} catch {
		throw new Error("The saved chat account is invalid. Nothing was launched.");
	}
}

export function findAccountCommand(db: ChatDb, commandId: string) {
	return (
		db
			.select()
			.from(chatSessionsLocal)
			.where(eq(chatSessionsLocal.createCommandId, commandId))
			.get() ?? null
	);
}

export function findAccountSuccessor(db: ChatDb, sessionId: string) {
	return (
		db
			.select()
			.from(chatSessionsLocal)
			.where(eq(chatSessionsLocal.predecessorSessionId, sessionId))
			.get() ?? null
	);
}
