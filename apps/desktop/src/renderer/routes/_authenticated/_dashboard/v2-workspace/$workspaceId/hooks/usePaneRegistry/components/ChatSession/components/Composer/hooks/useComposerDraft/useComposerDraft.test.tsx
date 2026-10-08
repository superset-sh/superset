import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { prependToDraft, takeRecoveredDraftText, useComposerDraft } =
	await import("./useComposerDraft");

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test("a composer mounted before the save delay reads text typed into the one it replaces", () => {
	const connecting = renderHook(() =>
		useComposerDraft("chat-v3-draft:handoff"),
	);
	act(() => connecting.result.current.onChange("typed while connecting"));

	const connected = renderHook(() => useComposerDraft("chat-v3-draft:handoff"));
	connecting.unmount();

	expect(connected.result.current.storedDraft).toBe("typed while connecting");
});

test("recovered text survives the composer's own save on unmount", () => {
	const recoveredFirst = renderHook(() =>
		useComposerDraft("chat-v3-draft:recover-a"),
	);
	act(() => recoveredFirst.result.current.onChange("newer draft"));
	prependToDraft("chat-v3-draft:recover-a", "unsent message");
	recoveredFirst.unmount();
	expect(window.localStorage.getItem("chat-v3-draft:recover-a")).toBe(
		"unsent message\n\nnewer draft",
	);

	const flushedFirst = renderHook(() =>
		useComposerDraft("chat-v3-draft:recover-b"),
	);
	act(() => flushedFirst.result.current.onChange("newer draft"));
	flushedFirst.unmount();
	prependToDraft("chat-v3-draft:recover-b", "unsent message");
	expect(window.localStorage.getItem("chat-v3-draft:recover-b")).toBe(
		"unsent message\n\nnewer draft",
	);
});

test("a draft that fails to save is still read from memory", () => {
	const setItem = spyOn(window.localStorage, "setItem").mockImplementation(
		() => {
			throw new Error("QuotaExceededError");
		},
	);
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	try {
		const first = renderHook(() => useComposerDraft("chat-v3-draft:quota"));
		act(() => first.result.current.onChange("kept in memory"));
		first.unmount();

		const next = renderHook(() => useComposerDraft("chat-v3-draft:quota"));
		expect(next.result.current.storedDraft).toBe("kept in memory");
	} finally {
		setItem.mockRestore();
		warn.mockRestore();
	}
});

test("text recovered after a composer read its draft is handed to it once", () => {
	renderHook(() => useComposerDraft("chat-v3-draft:late"));
	prependToDraft("chat-v3-draft:late", "unsent message");
	expect(takeRecoveredDraftText("chat-v3-draft:late")).toBe("unsent message");
	expect(takeRecoveredDraftText("chat-v3-draft:late")).toBeNull();

	prependToDraft("chat-v3-draft:early", "unsent message");
	const reader = renderHook(() => useComposerDraft("chat-v3-draft:early"));
	expect(reader.result.current.storedDraft).toBe("unsent message");
	expect(takeRecoveredDraftText("chat-v3-draft:early")).toBeNull();
});
