import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";

const { act, cleanup, fireEvent, render, renderHook } = await import(
	"@testing-library/react"
);
const { prependToDraft, takeRecoveredDraftText, useComposerDraft } =
	await import("./useComposerDraft");

function requireSubmission(
	submission: ReturnType<
		ReturnType<typeof useComposerDraft>["beginSubmission"]
	>,
) {
	if (!submission) throw new Error("Expected the submission to start");
	return submission;
}

const { PromptInput } = await import("@superset/chat-ui/PromptInput");
type PromptProps = import("@superset/chat-ui/PromptInput").PromptInputProps;

function PendingDraftComposer({
	draftKey,
	findChips,
	onSend,
}: Pick<PromptProps, "findChips"> & {
	draftKey: string;
	onSend: () => Promise<boolean>;
}) {
	const { storedDraft, onChange, beginSubmission } = useComposerDraft(draftKey);
	return (
		<PromptInput
			placeholder="Write a message"
			mentionProviders={[]}
			commands={[]}
			defaultValue={storedDraft}
			findChips={findChips}
			onChange={onChange}
			onSubmit={async (payload) => {
				const finish = beginSubmission(payload.text, payload.isDraftUnchanged);
				if (!finish) return false;
				try {
					const result = await onSend();
					finish(result);
					return result === false ? false : undefined;
				} catch (error) {
					finish(false);
					throw error;
				}
			}}
		/>
	);
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);
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

test("an accepted upload/send after unmount clears the submitted persisted draft", async () => {
	const { submitMessage } = await import("../../utils/submitMessage");
	const key = "chat-v3-draft:accepted-after-unmount";
	const composer = renderHook(() => useComposerDraft(key));
	act(() => composer.result.current.onChange("  submitted text  "));
	const upload = Promise.withResolvers<string[]>();
	const finishSubmission = requireSubmission(
		composer.result.current.beginSubmission("submitted text"),
	);
	const pending = submitMessage(
		{ text: "submitted text", files: [], mentions: [], steer: false },
		{ uploadAttachments: () => upload.promise, onSend: async () => true },
	);
	composer.unmount();
	upload.resolve([]);
	finishSubmission((await pending) !== false);
	expect(window.localStorage.getItem(key)).toBeNull();
	const remounted = renderHook(() => useComposerDraft(key));
	expect(remounted.result.current.storedDraft).toBeUndefined();
});

test("rejected or thrown submissions preserve the unmounted draft", async () => {
	const { submitMessage } = await import("../../utils/submitMessage");
	for (const rejection of [false, new Error("not accepted")]) {
		const key = `chat-v3-draft:rejected-${String(rejection)}`;
		const composer = renderHook(() => useComposerDraft(key));
		act(() => composer.result.current.onChange("keep this"));
		const finish = requireSubmission(
			composer.result.current.beginSubmission("keep this"),
		);
		composer.unmount();
		try {
			const result = await submitMessage(
				{ text: "keep this", files: [], mentions: [], steer: false },
				{
					uploadAttachments: async () => [],
					onSend: async () => {
						if (rejection instanceof Error) throw rejection;
						return rejection;
					},
				},
			);
			finish(result !== false);
		} catch {
			finish(false);
		}
		expect(window.localStorage.getItem(key)).toBe("keep this");
	}
});

test("a raw edit and undo invalidate a pending submission", () => {
	const key = "chat-v3-draft:submission-aba";
	const composer = renderHook(() => useComposerDraft(key));
	act(() => composer.result.current.onChange("  same text  "));
	const finish = requireSubmission(
		composer.result.current.beginSubmission("same text"),
	);
	act(() => composer.result.current.onChange("same text"));
	act(() => composer.result.current.onChange("  same text  "));
	composer.unmount();
	finish(true);
	expect(window.localStorage.getItem(key)).toBe("  same text  ");
});

test("recovered text invalidates a pending submission", () => {
	const key = "chat-v3-draft:submission-recovery";
	const composer = renderHook(() => useComposerDraft(key));
	act(() => composer.result.current.onChange("submitted"));
	const finish = requireSubmission(
		composer.result.current.beginSubmission("submitted"),
	);
	prependToDraft(key, "recovered queued message");
	composer.unmount();
	finish(true);
	expect(window.localStorage.getItem(key)).toBe(
		"recovered queued message\n\nsubmitted",
	);
});

test("a different mount of the same draft can edit while a submission settles", () => {
	const key = "chat-v3-draft:submission-other-mount";
	const first = renderHook(() => useComposerDraft(key));
	act(() => first.result.current.onChange("submitted"));
	const finish = requireSubmission(
		first.result.current.beginSubmission("submitted"),
	);
	const second = renderHook(() => useComposerDraft(key));
	act(() => second.result.current.onChange("newer draft"));
	first.unmount();
	finish(true);
	second.unmount();
	expect(window.localStorage.getItem(key)).toBe("newer draft");
});

test("a same-key remount cannot replace an in-flight submission", () => {
	const key = "chat-v3-draft:submission-newer";
	const first = renderHook(() => useComposerDraft(key));
	act(() => first.result.current.onChange("submitted"));
	const finish = requireSubmission(
		first.result.current.beginSubmission("submitted"),
	);
	first.unmount();
	const replacement = renderHook(() => useComposerDraft(key));
	try {
		expect(replacement.result.current.beginSubmission("submitted")).toBeNull();
	} finally {
		act(() => finish(true));
	}
	expect(window.localStorage.getItem(key)).toBeNull();
	expect(replacement.result.current.storedDraft).toBeUndefined();
});

test("acceptance retains an empty memory fallback when storage removal fails", () => {
	const key = "chat-v3-draft:submission-remove-failure";
	const composer = renderHook(() => useComposerDraft(key));
	act(() => composer.result.current.onChange("submitted"));
	const finish = requireSubmission(
		composer.result.current.beginSubmission("submitted"),
	);
	composer.unmount();
	const removeItem = spyOn(
		window.localStorage,
		"removeItem",
	).mockImplementation(() => {
		throw new Error("SecurityError");
	});
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	try {
		finish(true);
		const next = renderHook(() => useComposerDraft(key));
		expect(next.result.current.storedDraft).toBe("");
		act(() => next.result.current.onChange("newer draft"));
		next.unmount();
		expect(window.localStorage.getItem(key)).toBe("newer draft");
	} finally {
		removeItem.mockRestore();
		warn.mockRestore();
	}
});

test("a submission keeps its original draft key across navigation", () => {
	const firstKey = "chat-v3-draft:submission-navigation-a";
	const secondKey = "chat-v3-draft:submission-navigation-b";
	const composer = renderHook(({ key }) => useComposerDraft(key), {
		initialProps: { key: firstKey },
	});
	act(() => composer.result.current.onChange("submitted"));
	const finish = requireSubmission(
		composer.result.current.beginSubmission("submitted"),
	);
	composer.rerender({ key: secondKey });
	act(() => composer.result.current.onChange("next chat draft"));
	finish(true);
	composer.unmount();
	expect(window.localStorage.getItem(firstKey)).toBeNull();
	expect(window.localStorage.getItem(secondKey)).toBe("next chat draft");
});

test("acceptance clears the mounted seed before navigating back to the same draft", () => {
	const key = "chat-v3-draft:submission-seeded-navigation";
	window.localStorage.setItem(key, "submitted");
	const composer = renderHook(({ key }) => useComposerDraft(key), {
		initialProps: { key },
	});
	const finish = requireSubmission(
		composer.result.current.beginSubmission("submitted"),
	);
	act(() => finish(true));
	composer.rerender({
		key: "chat-v3-draft:submission-seeded-navigation-other",
	});
	composer.rerender({ key });
	expect(composer.result.current.storedDraft).toBeUndefined();
});

test("acceptance cannot restore the seed of a replacement mount", () => {
	const key = "chat-v3-draft:submission-replacement-seed";
	window.localStorage.setItem(key, "submitted");
	const first = renderHook(() => useComposerDraft(key));
	const finish = requireSubmission(
		first.result.current.beginSubmission("submitted"),
	);
	const replacement = renderHook(({ key }) => useComposerDraft(key), {
		initialProps: { key },
	});
	first.unmount();
	act(() => finish(true));
	replacement.rerender({ key: "chat-v3-draft:submission-replacement-other" });
	replacement.rerender({ key });
	expect(replacement.result.current.storedDraft).toBeUndefined();
});

test("a temporary storage read failure keeps the mounted draft seed", () => {
	const key = "chat-v3-draft:seed-read-failure";
	window.localStorage.setItem(key, "keep this draft");
	const composer = renderHook(() => useComposerDraft(key));
	const getItem = spyOn(window.localStorage, "getItem").mockImplementation(
		() => {
			throw new Error("SecurityError");
		},
	);
	try {
		composer.rerender();
		expect(composer.result.current.storedDraft).toBe("keep this draft");
	} finally {
		getItem.mockRestore();
	}
});

test("acceptance while navigated away clears the original cached seed", () => {
	const key = "chat-v3-draft:submission-away-seed";
	window.localStorage.setItem(key, "submitted");
	const composer = renderHook(({ key }) => useComposerDraft(key), {
		initialProps: { key },
	});
	const finish = requireSubmission(
		composer.result.current.beginSubmission("submitted"),
	);
	composer.rerender({ key: "chat-v3-draft:submission-away-other" });
	finish(true);
	composer.rerender({ key });
	expect(composer.result.current.storedDraft).toBeUndefined();
});

test("a late plugin chip stays saved when a send is accepted after close", async () => {
	const key = "chat-v3-draft:late-plugin-hydration";
	const text = "Review @example.ts";
	window.localStorage.setItem(key, text);
	const accepted = Promise.withResolvers<boolean>();
	const onSend = () => accepted.promise;
	const composer = render(
		<PendingDraftComposer draftKey={key} onSend={onSend} />,
	);
	await act(async () => {});
	fireEvent.click(composer.getByRole("button", { name: "Send message" }));
	composer.rerender(
		<PendingDraftComposer
			draftKey={key}
			onSend={onSend}
			findChips={() => [
				{
					start: 7,
					end: text.length,
					chip: { label: "Example file", serialized: "@example.ts" },
				},
			]}
		/>,
	);
	await act(async () => {});

	expect(composer.getByText("Example file")).toBeTruthy();
	expect(composer.getByRole("textbox").textContent).toBe("Review Example file");
	composer.unmount();
	await act(async () => accepted.resolve(true));
	expect(window.localStorage.getItem(key)).toBe(text);
	const reopened = render(
		<PendingDraftComposer draftKey={key} onSend={onSend} />,
	);
	await act(async () => {});

	expect(reopened.getByRole("textbox").textContent).toBe(text);
});

test("draft edits, clearing and recovery do not release an in-flight send", () => {
	for (const change of ["edit", "clear", "recover"]) {
		const key = `chat-v3-draft:pending-${change}`;
		const first = renderHook(() => useComposerDraft(key));
		act(() => first.result.current.onChange("submitted"));
		const finish = requireSubmission(
			first.result.current.beginSubmission("submitted"),
		);
		act(() => {
			if (change === "edit") first.result.current.onChange("newer draft");
			if (change === "clear") first.result.current.clearDraft();
			if (change === "recover") prependToDraft(key, "recovered");
		});
		first.unmount();
		const replacement = renderHook(() => useComposerDraft(key));
		try {
			expect(
				replacement.result.current.beginSubmission("next send"),
			).toBeNull();
		} finally {
			finish(false);
		}
		const retry = replacement.result.current.beginSubmission("next send");
		expect(retry).toBeFunction();
		retry?.(false);
		replacement.unmount();
	}
});

test("in-flight guards stay with their draft key across navigation", () => {
	const key = "chat-v3-draft:pending-navigation";
	const composer = renderHook(({ draftKey }) => useComposerDraft(draftKey), {
		initialProps: { draftKey: key },
	});
	act(() => composer.result.current.onChange("first draft"));
	const finishFirst = requireSubmission(
		composer.result.current.beginSubmission("first draft"),
	);
	composer.rerender({ draftKey: `${key}-other` });
	act(() => composer.result.current.onChange("second draft"));
	const finishOther = requireSubmission(
		composer.result.current.beginSubmission("second draft"),
	);
	expect(finishOther).toBeFunction();
	composer.rerender({ draftKey: key });
	try {
		expect(composer.result.current.beginSubmission("first draft")).toBeNull();
	} finally {
		act(() => finishFirst(true));
		act(() => finishOther?.(false));
	}
	const retry = composer.result.current.beginSubmission("another message");
	expect(retry).toBeFunction();
	retry?.(false);
	composer.unmount();
	expect(window.localStorage.getItem(key)).toBeNull();
	expect(window.localStorage.getItem(`${key}-other`)).toBe("second draft");
});

test("a remounted chip-edited composer declines duplicate sends until acceptance", async () => {
	const key = "chat-v3-draft:pending-remount-chip";
	const text = "Review @example.ts";
	window.localStorage.setItem(key, text);
	const accepted = Promise.withResolvers<boolean>();
	let sendCount = 0;
	const onSend = () => {
		sendCount += 1;
		return accepted.promise;
	};
	const original = render(
		<PendingDraftComposer draftKey={key} onSend={onSend} />,
	);
	await act(async () => {});
	fireEvent.click(original.getByRole("button", { name: "Send message" }));
	original.rerender(
		<PendingDraftComposer
			draftKey={key}
			onSend={onSend}
			findChips={() => [
				{
					start: 7,
					end: text.length,
					chip: { label: "Example file", serialized: "@example.ts" },
				},
			]}
		/>,
	);
	await act(async () => {});
	expect(original.getByText("Example file")).toBeTruthy();
	original.unmount();
	const replacement = render(
		<PendingDraftComposer draftKey={key} onSend={onSend} />,
	);
	await act(async () => {});
	try {
		await act(async () =>
			fireEvent.click(
				replacement.getByRole("button", { name: "Send message" }),
			),
		);
		expect(sendCount).toBe(1);
	} finally {
		await act(async () => accepted.resolve(true));
	}
	expect(window.localStorage.getItem(key)).toBe(text);
	expect(replacement.getByRole("textbox").textContent).toBe(text);
	await act(async () =>
		fireEvent.click(replacement.getByRole("button", { name: "Send message" })),
	);
	expect(sendCount).toBe(2);
	replacement.unmount();
	expect(window.localStorage.getItem(key)).toBeNull();
});

test.each([
	false,
	new Error("not accepted"),
])("a remounted composer can retry after a pending send settles with %s", async (rejection) => {
	const key = `chat-v3-draft:pending-remount-rejected-${String(rejection)}`;
	window.localStorage.setItem(key, "retry this draft");
	const pending = Promise.withResolvers<boolean>();
	let sendCount = 0;
	const onSend = () => {
		sendCount += 1;
		return pending.promise;
	};
	const original = render(
		<PendingDraftComposer draftKey={key} onSend={onSend} />,
	);
	await act(async () => {});
	fireEvent.click(original.getByRole("button", { name: "Send message" }));
	original.unmount();
	const replacement = render(
		<PendingDraftComposer draftKey={key} onSend={onSend} />,
	);
	await act(async () => {});
	try {
		await act(async () =>
			fireEvent.click(
				replacement.getByRole("button", { name: "Send message" }),
			),
		);
		expect(sendCount).toBe(1);
	} finally {
		await act(async () => {
			if (rejection instanceof Error) pending.reject(rejection);
			else pending.resolve(false);
		});
	}
	expect(replacement.getByRole("textbox").textContent).toBe("retry this draft");
	await act(async () =>
		fireEvent.click(replacement.getByRole("button", { name: "Send message" })),
	);
	expect(sendCount).toBe(2);
	replacement.unmount();
	expect(window.localStorage.getItem(key)).toBe("retry this draft");
});
