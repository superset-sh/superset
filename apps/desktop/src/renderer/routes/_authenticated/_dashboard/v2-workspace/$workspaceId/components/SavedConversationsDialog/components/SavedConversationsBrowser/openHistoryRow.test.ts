import { expect, mock, test } from "bun:test";
import { openHistoryRow } from "./openHistoryRow";

const row = {
	id: "native-id",
	nativeSessionId: "native-id",
	conversationId: null,
	revision: "scan-revision",
	canFocusExisting: false,
};

test("opens the adopted local ID and current revision, never the original scan", async () => {
	const adopt = mock(async () => ({
		id: "local-id",
		revision: "local-revision",
	}));
	const open = mock(async () => ({ terminalId: "terminal" }));
	expect(
		await openHistoryRow({
			row,
			originalSessionExited: true,
			isCurrent: () => true,
			adopt,
			open,
		}),
	).toBe("terminal");
	expect(adopt).toHaveBeenCalledWith({
		nativeSessionId: "native-id",
		expectedRevision: "scan-revision",
	});
	expect(open).toHaveBeenCalledWith({
		conversationId: "local-id",
		expectedRevision: "local-revision",
		originalSessionExited: true,
	});
});

test("an already adopted row opens locally without scanning or adopting again", async () => {
	const adopt = mock(async () => ({ id: "wrong", revision: "wrong" }));
	const open = mock(async () => ({ terminalId: "existing-terminal" }));
	await openHistoryRow({
		row: { ...row, conversationId: "local-id" },
		originalSessionExited: false,
		isCurrent: () => true,
		adopt,
		open,
	});
	expect(adopt).not.toHaveBeenCalled();
	expect(open).toHaveBeenCalledWith({
		conversationId: "local-id",
		expectedRevision: "scan-revision",
		originalSessionExited: false,
	});
});

test("changing host or account during adoption does not launch its old selection", async () => {
	let current = true;
	const open = mock(async () => ({ terminalId: "wrong" }));
	const result = await openHistoryRow({
		row,
		originalSessionExited: true,
		isCurrent: () => current,
		adopt: async () => {
			current = false;
			return { id: "local-id", revision: "local-revision" };
		},
		open,
	});
	expect(result).toBeNull();
	expect(open).not.toHaveBeenCalled();
});

test("changing context during an authorized launch does not navigate the new workspace", async () => {
	let current = true;
	const result = await openHistoryRow({
		row: { ...row, conversationId: "local-id" },
		originalSessionExited: false,
		isCurrent: () => current,
		adopt: async () => {
			throw new Error("Must not adopt");
		},
		open: async () => {
			current = false;
			return { terminalId: "old-workspace-terminal" };
		},
	});
	expect(result).toBeNull();
});
