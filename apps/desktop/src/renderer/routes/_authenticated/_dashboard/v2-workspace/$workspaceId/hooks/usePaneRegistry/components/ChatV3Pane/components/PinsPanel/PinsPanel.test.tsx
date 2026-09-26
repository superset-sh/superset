import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ChatPinRow } from "@superset/chat-runtime";

// happy-dom over the preloaded plain-object document: Radix needs a real DOM.
// Globals are process-wide, so unregister in afterAll (see Redirect.test.tsx).
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Queries go through `within(document.body)` rather than `screen`: in a full
// suite run an earlier file may have loaded testing-library against a previous
// happy-dom window, and `screen` stays bound to that stale body.
const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { PinsPanel } = await import("./PinsPanel");

afterEach(() => {
	cleanup();
	document.body.style.pointerEvents = "";
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function pin(overrides: Partial<ChatPinRow> = {}): ChatPinRow {
	return {
		sessionId: "session-1",
		itemId: "msg-1#0",
		label: "Deploy checklist",
		snapshotText: "- [ ] build\n- [ ] deploy",
		createdAt: 1,
		...overrides,
	};
}

describe("PinsPanel", () => {
	test("renders nothing without pins", () => {
		render(
			<PinsPanel
				onJump={() => {}}
				onQuote={() => {}}
				onRename={() => {}}
				onUnpin={() => {}}
				pins={[]}
			/>,
		);
		expect(document.body.textContent ?? "").not.toContain("Deploy checklist");
	});

	test("jump, quote, and unpin actions fire with the pin identity", () => {
		const onJump = mock(() => {});
		const onQuote = mock(() => {});
		const onUnpin = mock(() => {});
		const onRename = mock(() => {});
		render(
			<PinsPanel
				onJump={onJump}
				onQuote={onQuote}
				onRename={onRename}
				onUnpin={onUnpin}
				pins={[pin()]}
			/>,
		);
		const panel = () => within(document.body);
		expect(panel().getByText("Deploy checklist")).toBeTruthy();
		expect(
			panel().getByText(
				(_, element) =>
					element?.tagName === "P" &&
					(element.textContent ?? "").includes("deploy"),
			),
		).toBeTruthy();

		fireEvent.click(panel().getByTitle("Jump to message"));
		expect(onJump).toHaveBeenCalledWith("msg-1#0");
		fireEvent.click(panel().getByTitle("Insert into prompt"));
		expect(onQuote).toHaveBeenCalledWith("- [ ] build\n- [ ] deploy");
		fireEvent.click(panel().getByTitle("Unpin message"));
		expect(onUnpin).toHaveBeenCalledWith("msg-1#0");
	});

	test("rename commits the edited label on Enter", async () => {
		const onRename = mock(() => {});
		render(
			<PinsPanel
				onJump={() => {}}
				onQuote={() => {}}
				onRename={onRename}
				onUnpin={() => {}}
				pins={[pin()]}
			/>,
		);
		const panel = () => within(document.body);
		fireEvent.click(panel().getByTitle("Rename"));
		const input = panel().getByDisplayValue("Deploy checklist");
		await act(async () => {
			fireEvent.change(input, { target: { value: "Edited" } });
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
		});
		expect(onRename).toHaveBeenCalledWith("msg-1#0", "Edited");
	});
});
