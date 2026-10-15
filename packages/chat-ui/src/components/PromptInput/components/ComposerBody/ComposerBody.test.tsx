import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { LexicalEditor } from "lexical";
import type { ComposerBodyProps } from "./ComposerBody";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

mock.module("@lingui/react/macro", () => ({
	Trans: ({ children }: { children?: unknown }) => children,
	useLingui: () => ({
		t: ({ message }: { message: string }) => message,
	}),
}));

const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { useEffect } = await import("react");
const { LexicalComposer } = await import("@lexical/react/LexicalComposer");
const { useLexicalComposerContext } = await import(
	"@lexical/react/LexicalComposerContext"
);
const {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$isElementNode,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_UP_COMMAND,
	KEY_ENTER_COMMAND,
} = await import("lexical");
const { MentionChipNode } = await import("../../nodes/mentionChipNode");
const { ComposerBody } = await import("./ComposerBody");

function EditorProbe({
	onEditor,
}: {
	onEditor: (editor: LexicalEditor) => void;
}) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => onEditor(editor), [editor, onEditor]);
	return null;
}

async function setup(
	onSubmit: ComposerBodyProps["onSubmit"],
	{ history }: Pick<ComposerBodyProps, "history"> = {},
) {
	let editor: LexicalEditor | undefined;
	const view = render(
		<LexicalComposer
			initialConfig={{
				namespace: "composer-submit-test",
				nodes: [MentionChipNode],
				onError: (error) => {
					throw error;
				},
			}}
		>
			<EditorProbe
				onEditor={(value) => {
					editor = value;
				}}
			/>
			<ComposerBody
				placeholder="Write a message"
				status="ready"
				submitWhileStreaming={false}
				placement="top"
				clearOnSubmit
				history={history}
				onSubmit={onSubmit}
			/>
		</LexicalComposer>,
	);
	const currentEditor = editor;
	if (!currentEditor) throw new Error("Editor did not mount");
	const write = async (text: string, chip = false) => {
		await act(async () => {
			currentEditor.update(
				() => {
					const paragraph = $createParagraphNode();
					paragraph.append($createTextNode(text));
					if (chip)
						paragraph.append(
							MentionChipNode.fromChip({
								label: "Example file",
								serialized: "@example.ts",
								data: { path: "example.ts" },
							}),
						);
					$getRoot().clear().append(paragraph);
				},
				{ discrete: true },
			);
		});
	};
	const attach = (file: File) => {
		const input =
			view.container.querySelector<HTMLInputElement>("input[type=file]");
		if (!input) throw new Error("File input did not mount");
		fireEvent.change(input, { target: { files: [file] } });
	};
	await write("Review the file");
	return {
		...view,
		editor: currentEditor,
		write,
		attach,
		text: () =>
			currentEditor.getEditorState().read(() => $getRoot().getTextContent()),
		submit: () =>
			fireEvent.click(view.getByRole("button", { name: "Send message" })),
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test("keeps the full draft and attachment while submission is pending", async () => {
	const pending = deferred<void>();
	const view = await setup(() => pending.promise);
	view.attach(new File(["fixture"], "review.txt"));
	view.submit();
	await act(async () => {});
	try {
		expect(view.text()).toBe("Review the file");
		expect(view.getByText("review.txt")).toBeTruthy();
	} finally {
		await act(async () => pending.resolve());
	}
});

test("does not submit twice while acceptance is pending", async () => {
	const pending = deferred<void>();
	const onSubmit = mock(() => pending.promise);
	const view = await setup(onSubmit);
	view.submit();
	await view.write("Another draft");
	view.submit();
	await act(async () => pending.resolve());
	expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("ignores another Enter key while submission is pending", async () => {
	const pending = deferred<void>();
	const onSubmit = mock(() => pending.promise);
	const view = await setup(onSubmit);
	view.submit();
	await view.write("Another draft");
	await act(async () => {
		view.editor.dispatchCommand(
			KEY_ENTER_COMMAND,
			new KeyboardEvent("keydown", { key: "Enter" }),
		);
	});
	await act(async () => pending.resolve());
	expect(onSubmit).toHaveBeenCalledTimes(1);
	expect(view.text()).toBe("Another draft");
});

test("keeps a draft when submission returns false", async () => {
	const view = await setup(() => false);
	view.submit();
	await act(async () => {});
	expect(view.text()).toBe("Review the file");
});

test("keeps text and files when asynchronous submission declines", async () => {
	const view = await setup(async () => false);
	view.attach(new File(["fixture"], "review.txt"));
	view.submit();
	await act(async () => {});
	expect(view.text()).toBe("Review the file");
	expect(view.getByText("review.txt")).toBeTruthy();
});

test("handles rejected submission and leaves the draft available for a manual retry", async () => {
	const pending = deferred<void>();
	const onSubmit = mock(() => pending.promise);
	const view = await setup(onSubmit);
	view.attach(new File(["fixture"], "review.txt"));
	view.submit();
	await act(async () => pending.reject(new Error("Transport unavailable")));
	expect(view.text()).toBe("Review the file");
	expect(view.getByText("review.txt")).toBeTruthy();
	expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("clears an accepted unchanged draft and its attachments", async () => {
	const pending = deferred<void>();
	const view = await setup(() => pending.promise);
	view.attach(new File(["fixture"], "review.txt"));
	view.submit();
	await act(async () => pending.resolve());
	expect(view.text()).toBe("");
	expect(view.queryByText("review.txt")).toBeNull();
});

test("preserves new Lexical chips, text and files after an earlier send succeeds", async () => {
	const pending = deferred<void>();
	const view = await setup(() => pending.promise);
	view.attach(new File(["old"], "review.txt"));
	view.submit();
	await view.write("Next task ", true);
	view.attach(new File(["new"], "next.txt"));
	await act(async () => pending.resolve());
	expect(view.text()).toBe("Next task @example.ts");
	expect(view.getByText("Example file")).toBeTruthy();
	expect(view.getByText("next.txt")).toBeTruthy();
	expect(view.queryByText("review.txt")).toBeNull();
});

test("preserves a draft edited back to its original text while pending", async () => {
	const pending = deferred<void>();
	const view = await setup(() => pending.promise);
	view.submit();
	await view.write("Different draft");
	await view.write("Review the file");
	await act(async () => pending.resolve());
	expect(view.text()).toBe("Review the file");
});

test("preserves the newer draft saved by history navigation while a send is pending", async () => {
	const pending = deferred<void>();
	const view = await setup(() => pending.promise, {
		history: ["Earlier question"],
	});
	view.submit();
	await view.write("Next task draft");
	await act(async () => {
		view.editor.update(
			() => {
				$getRoot().selectStart();
				view.editor.dispatchCommand(KEY_ARROW_UP_COMMAND, null);
			},
			{ discrete: true },
		);
	});
	expect(view.text()).toBe("Earlier question");
	await act(async () => pending.resolve());
	await act(async () => {
		view.editor.update(
			() => {
				$getRoot().selectEnd();
				view.editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, null);
			},
			{ discrete: true },
		);
	});
	expect(view.text()).toBe("Next task draft");
});

test("selection changes do not keep an otherwise accepted unchanged draft", async () => {
	const pending = deferred<void>();
	const view = await setup(() => pending.promise);
	view.submit();
	await act(async () => {
		view.editor.update(() => $getRoot().selectStart(), { discrete: true });
	});
	await act(async () => pending.resolve());
	expect(view.text()).toBe("");
});

test("flushes a pending Lexical edit before deciding whether to clear it", async () => {
	const pending = deferred<void>();
	const view = await setup(() => pending.promise);
	view.submit();
	await act(async () => {
		pending.resolve();
		view.editor.update(() => {
			const paragraph = $getRoot().getFirstChildOrThrow();
			if (!$isElementNode(paragraph)) throw new Error("Expected a paragraph");
			paragraph.append($createTextNode(" with more context"));
		});
	});
	expect(view.text()).toBe("Review the file with more context");
});

test("submission exposes the flushed content revision used for draft clearing", async () => {
	const pending = deferred<void>();
	let isDraftUnchanged: (() => boolean) | undefined;
	const view = await setup((payload) => {
		isDraftUnchanged = payload.isDraftUnchanged;
		return pending.promise;
	});
	await view.write("@example.ts");
	view.submit();
	expect(isDraftUnchanged?.()).toBe(true);
	await act(async () => {
		view.editor.update(() => $getRoot().selectStart(), { discrete: true });
	});
	expect(isDraftUnchanged?.()).toBe(true);
	await act(async () => {
		view.editor.update(() => {
			const paragraph = $getRoot().getFirstChildOrThrow();
			if (!$isElementNode(paragraph)) throw new Error("Expected a paragraph");
			paragraph.clear().append(
				MentionChipNode.fromChip({
					label: "Example file",
					serialized: "@example.ts",
				}),
			);
		});
		expect(isDraftUnchanged?.()).toBe(false);
	});
	await act(async () => pending.resolve());
	expect(view.text()).toBe("@example.ts");
	expect(view.getByText("Example file")).toBeTruthy();
});
