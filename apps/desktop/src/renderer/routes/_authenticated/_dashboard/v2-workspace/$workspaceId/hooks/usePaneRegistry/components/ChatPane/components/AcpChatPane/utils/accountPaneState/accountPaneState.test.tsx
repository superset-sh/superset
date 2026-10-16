import { afterEach, expect, test } from "bun:test";
import type { ChatPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import {
	accountChatDraftKey,
	adoptAccountChatSession,
} from "./accountPaneState";

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useComposerDraft } = await import(
	"../../../../../ChatSession/components/Composer/hooks/useComposerDraft/useComposerDraft"
);

const ownedDraftKeys = new Set<string>();
afterEach(() => {
	cleanup();
	for (const key of ownedDraftKeys) window.localStorage.removeItem(key);
	ownedDraftKeys.clear();
});

function draftKey(data: ChatPaneData) {
	const key = accountChatDraftKey(data);
	ownedDraftKeys.add(key);
	return key;
}

function data(): ChatPaneData {
	const commandId = crypto.randomUUID();
	return {
		terminalId: crypto.randomUUID(),
		sessionId: null,
		agent: { id: "claude" },
		accountBound: true,
		accountDraftId: commandId,
		accountLaunch: {
			hostUrl: "http://fixture.invalid",
			request: {
				commandId,
				workspaceId: "fixture-workspace",
				harness: "claude-acp",
				account: { selection: null, identity: "a".repeat(64) },
			},
		},
		pendingPrompt: "saved first prompt",
		pendingAttachments: [
			{
				attachmentId: "fixture-file",
				name: "file.txt",
				mimeType: "text/plain",
			},
		],
		queuedPrompts: [[{ type: "text", text: "second prompt" }]],
		chatModelId: "model",
		chatModeId: "mode",
		chatTitle: "title",
	};
}

test("adopting the receipt consumes only launch intent and preserves queued work and identity", () => {
	const pending = data();
	const before = structuredClone(pending);
	const adopted = adoptAccountChatSession(pending, {
		sessionId: "server-session",
		terminalId: "server-terminal",
	});
	expect(pending).toEqual(before);
	expect(adopted.accountLaunch).toBeUndefined();
	expect(adopted.accountBound).toBe(true);
	expect(adopted.accountDraftId).toBe(pending.accountDraftId);
	expect(adopted.pendingPrompt).toBe(pending.pendingPrompt);
	expect(adopted.pendingAttachments).toEqual(pending.pendingAttachments);
	expect(adopted.queuedPrompts).toEqual(pending.queuedPrompts);
	expect(adopted.agent).toEqual(pending.agent);
	expect(adopted.chatModelId).toBe("model");
	expect(adopted.chatModeId).toBe("mode");
	expect(adopted.chatTitle).toBe("title");
});

test("text typed before create completes survives the actual composer remount and receipt retry", () => {
	const pending = data();
	const starting = renderHook(() => useComposerDraft(draftKey(pending)));
	act(() => starting.result.current.onChange("typed during connection"));
	const adopted = adoptAccountChatSession(pending, {
		sessionId: "server-session",
		terminalId: "server-terminal",
	});
	// React may mount the new keyed subtree before the old draft's debounce runs.
	const running = renderHook(() => useComposerDraft(draftKey(adopted)));
	starting.unmount();
	expect(running.result.current.storedDraft).toBe("typed during connection");
	expect(adopted.terminalId).not.toBe(pending.terminalId);
	expect(draftKey(adopted)).toBe(draftKey(pending));
	expect(window.localStorage.getItem(draftKey(adopted))).toBe(
		"typed during connection",
	);
	const retried = adoptAccountChatSession(adopted, {
		sessionId: "server-session",
		terminalId: "server-terminal",
	});
	expect(retried).toEqual(adopted);
});

test("recovery preserves the draft key of an older account pane without a draft marker", () => {
	const pending = data();
	delete pending.accountDraftId;
	delete pending.accountLaunch;
	pending.sessionId = "ended-session";
	const stopped = renderHook(() => useComposerDraft(draftKey(pending)));
	act(() => stopped.result.current.onChange("keep this recovery draft"));
	stopped.unmount();
	const recovered = adoptAccountChatSession(pending, {
		sessionId: "recovered-session",
		terminalId: "authoritative-terminal",
	});
	const resumed = renderHook(() => useComposerDraft(draftKey(recovered)));
	expect(resumed.result.current.storedDraft).toBe("keep this recovery draft");
	expect(draftKey(recovered)).toBe(draftKey(pending));
	expect(recovered.accountBound).toBe(true);
});
