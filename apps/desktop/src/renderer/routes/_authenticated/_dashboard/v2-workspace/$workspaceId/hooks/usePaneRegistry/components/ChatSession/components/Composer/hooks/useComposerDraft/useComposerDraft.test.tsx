import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { ComposerDraft } from "@superset/chat-ui/PromptInput";

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { prependToDraft, takeRecoveredDraft, useComposerDraft } = await import(
	"./useComposerDraft"
);

const text = (value: string): ComposerDraft => ({
	segments: [{ type: "text", text: value }],
	attachments: [],
});
const stored = (key: string) =>
	JSON.parse(window.localStorage.getItem(key) ?? "null");

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

test("a composer mounted before the save delay reads what was typed into the one it replaces", () => {
	const connecting = renderHook(() =>
		useComposerDraft("chat-v3-draft:handoff"),
	);
	act(() =>
		connecting.result.current.onDraftChange(text("typed while connecting")),
	);

	const connected = renderHook(() => useComposerDraft("chat-v3-draft:handoff"));
	connecting.unmount();

	expect(connected.result.current.storedDraft).toEqual(
		text("typed while connecting"),
	);
});

test("a recovered draft survives the composer's own save on unmount", () => {
	const recoveredFirst = renderHook(() =>
		useComposerDraft("chat-v3-draft:recover-a"),
	);
	act(() => recoveredFirst.result.current.onDraftChange(text("newer draft")));
	prependToDraft("chat-v3-draft:recover-a", [text("unsent message")]);
	recoveredFirst.unmount();
	expect(stored("chat-v3-draft:recover-a")).toEqual([
		{ type: "text", text: "unsent message" },
		{ type: "text", text: "\n\n" },
		{ type: "text", text: "newer draft" },
	]);

	const flushedFirst = renderHook(() =>
		useComposerDraft("chat-v3-draft:recover-b"),
	);
	act(() => flushedFirst.result.current.onDraftChange(text("newer draft")));
	flushedFirst.unmount();
	prependToDraft("chat-v3-draft:recover-b", [text("unsent message")]);
	expect(stored("chat-v3-draft:recover-b")).toEqual([
		{ type: "text", text: "unsent message" },
		{ type: "text", text: "\n\n" },
		{ type: "text", text: "newer draft" },
	]);
});

test("chips and attachments of an unsent prompt come back with it", () => {
	const chip = { label: "Linear", serialized: "@linear" };
	const file = new File(["x"], "shot.png", { type: "image/png" });
	prependToDraft("chat-v3-draft:rich", [
		{
			segments: [
				{ type: "text", text: "fix " },
				{ type: "chip", chip },
			],
			attachments: [{ id: "a1", file }],
		},
	]);
	const reader = renderHook(() => useComposerDraft("chat-v3-draft:rich"));
	expect(reader.result.current.storedDraft).toEqual({
		segments: [
			{ type: "text", text: "fix " },
			{ type: "chip", chip },
		],
		attachments: [{ id: "a1", file }],
	});
	expect(stored("chat-v3-draft:rich")).toEqual([
		{ type: "text", text: "fix " },
		{ type: "chip", chip },
	]);
});

test("a plain-text draft saved by an older build still reads", () => {
	window.localStorage.setItem("chat-v3-draft:legacy", "old text");
	const reader = renderHook(() => useComposerDraft("chat-v3-draft:legacy"));
	expect(reader.result.current.storedDraft).toEqual(text("old text"));
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
		act(() => first.result.current.onDraftChange(text("kept in memory")));
		first.unmount();

		const next = renderHook(() => useComposerDraft("chat-v3-draft:quota"));
		expect(next.result.current.storedDraft).toEqual(text("kept in memory"));
	} finally {
		setItem.mockRestore();
		warn.mockRestore();
	}
});

test("a draft recovered after a composer read its own is handed to it once", () => {
	renderHook(() => useComposerDraft("chat-v3-draft:late"));
	prependToDraft("chat-v3-draft:late", [text("unsent message")]);
	expect(takeRecoveredDraft("chat-v3-draft:late")).toEqual(
		text("unsent message"),
	);
	expect(takeRecoveredDraft("chat-v3-draft:late")).toBeNull();

	prependToDraft("chat-v3-draft:early", [text("unsent message")]);
	const reader = renderHook(() => useComposerDraft("chat-v3-draft:early"));
	expect(reader.result.current.storedDraft).toEqual(text("unsent message"));
	expect(takeRecoveredDraft("chat-v3-draft:early")).toBeNull();
});
