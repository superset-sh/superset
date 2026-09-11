import type { ServerComment, ServerThread } from "../../types";

export function insertThread(
	rows: ServerThread[],
	row: ServerThread,
): ServerThread[] {
	return [...rows, row];
}

export function replaceThread(
	rows: ServerThread[],
	placeholderId: string,
	row: ServerThread,
): ServerThread[] {
	return rows.map((existing) =>
		existing.id === placeholderId ? row : existing,
	);
}

export function removeThread(
	rows: ServerThread[],
	threadId: string,
): ServerThread[] {
	return rows.filter((row) => row.id !== threadId);
}

export function setThreadResolved(
	rows: ServerThread[],
	threadId: string,
	resolved: boolean,
): ServerThread[] {
	return rows.map((row) => (row.id === threadId ? { ...row, resolved } : row));
}

export function appendComment(
	rows: ServerThread[],
	threadId: string,
	comment: ServerComment,
): ServerThread[] {
	return rows.map((row) =>
		row.id === threadId
			? { ...row, comments: [...row.comments, comment] }
			: row,
	);
}

export function replaceComment(
	rows: ServerThread[],
	threadId: string,
	placeholderId: string,
	comment: ServerComment,
): ServerThread[] {
	return rows.map((row) =>
		row.id === threadId
			? {
					...row,
					comments: row.comments.map((existing) =>
						existing.id === placeholderId ? comment : existing,
					),
				}
			: row,
	);
}

export function editCommentBody(
	rows: ServerThread[],
	commentId: string,
	body: string,
): ServerThread[] {
	return rows.map((row) => ({
		...row,
		comments: row.comments.map((comment) =>
			comment.id === commentId ? { ...comment, body } : comment,
		),
	}));
}
