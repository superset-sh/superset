import type { SavedHistoryRow } from "../../historyRows";

export async function openHistoryRow({
	row,
	originalSessionExited,
	isCurrent,
	adopt,
	open,
}: {
	row: SavedHistoryRow;
	originalSessionExited: boolean;
	isCurrent: () => boolean;
	adopt: (input: {
		nativeSessionId: string;
		expectedRevision: string;
	}) => Promise<{ id: string; revision: string }>;
	open: (input: {
		conversationId: string;
		expectedRevision: string;
		originalSessionExited: boolean;
	}) => Promise<{ terminalId: string }>;
}): Promise<string | null> {
	if (!isCurrent()) return null;
	const saved = row.conversationId
		? { id: row.conversationId, revision: row.revision }
		: await adopt({
				nativeSessionId: row.nativeSessionId,
				expectedRevision: row.revision,
			});
	if (!isCurrent()) return null;
	const result = await open({
		conversationId: saved.id,
		expectedRevision: saved.revision,
		originalSessionExited,
	});
	return isCurrent() ? result.terminalId : null;
}
