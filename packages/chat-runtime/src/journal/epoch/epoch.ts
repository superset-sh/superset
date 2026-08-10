import { randomUUID } from "node:crypto";
import type { ChatDb } from "../../db";
import {
	insertSessionRow,
	readSessionRow,
	resetSessionForEpoch,
} from "../../projection";
import { latestSeq } from "../../replay";

export type ChatSessionInit = {
	sessionId: string;
	scopeId: string;
	harness: string;
	harnessSessionId?: string | null;
	status?: string;
	title?: string | null;
};

export type OpenedEpoch = {
	epoch: string;
	minted: boolean;
};

export function mintEpoch(): string {
	return randomUUID();
}

export function openEpoch(db: ChatDb, init: ChatSessionInit): OpenedEpoch {
	const row = readSessionRow(db, init.sessionId);

	if (!row) {
		const epoch = mintEpoch();
		insertSessionRow(db, {
			sessionId: init.sessionId,
			scopeId: init.scopeId,
			harness: init.harness,
			harnessSessionId: init.harnessSessionId ?? null,
			epoch,
			status: init.status ?? "starting",
			title: init.title ?? null,
			queuedCount: 0,
			updatedAt: Date.now(),
		});
		return { epoch, minted: true };
	}

	if (latestSeq(db, init.sessionId, row.epoch) > 0) {
		return { epoch: row.epoch, minted: false };
	}

	const epoch = mintEpoch();
	resetSessionForEpoch(
		db,
		init.sessionId,
		epoch,
		init.status ?? "starting",
		Date.now(),
	);
	return { epoch, minted: true };
}
