import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
	ChatPaneActionsProvider,
	type OpenLink,
} from "../../../../../../providers/ChatPaneActionsProvider";
import { ShellIntentTitle } from "./ShellIntentTitle";

// File icons resolve against the page URL, and the test DOM starts on about:blank.
const page = (
	window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM;
beforeAll(() => page.setURL("http://localhost/"));
afterAll(() => page.setURL("about:blank"));
afterEach(cleanup);

test("a read is a verb and a file chip that opens the file at its line", () => {
	const openLink = mock<OpenLink>(() => true);
	const view = render(
		<ChatPaneActionsProvider openLink={openLink}>
			<ShellIntentTitle
				intent={{ verb: "read", path: "src/app.ts", startLine: 120 }}
				verb="Read"
				running={false}
			/>
		</ChatPaneActionsProvider>,
	);
	expect(view.container.textContent).toBe("Readsrc/app.ts:120");
	const chip = view.getByRole("button");
	expect(chip.querySelector("img")?.getAttribute("src")).toContain(
		"file-icons/",
	);
	fireEvent.click(chip);
	expect(openLink.mock.calls.map(([href]) => href)).toEqual(["src/app.ts:120"]);
});

test("an absolute path shows its name and opens in full", () => {
	const openLink = mock<OpenLink>(() => true);
	const view = render(
		<ChatPaneActionsProvider openLink={openLink}>
			<ShellIntentTitle
				intent={{ verb: "read", path: "/Users/me/repo/src/app.ts" }}
				verb="Read"
				running={false}
			/>
		</ChatPaneActionsProvider>,
	);
	const chip = view.getByRole("button");
	expect(chip.textContent).toBe("app.ts");
	expect(chip.title).toBe("/Users/me/repo/src/app.ts");
	fireEvent.click(chip);
	expect(openLink.mock.calls[0]?.[0]).toBe("/Users/me/repo/src/app.ts");
});

test("a search shows its query plain and where it looked", () => {
	const view = render(
		<ShellIntentTitle
			intent={{ verb: "search", query: "useQueue", path: "src" }}
			verb="Searched"
			running={false}
		/>,
	);
	expect(view.container.textContent).toBe("SearcheduseQueuein src");
	expect(view.queryByRole("button")).toBeNull();
	expect(view.container.querySelector("img")).toBeNull();
});

test("without a pane to open into, the chip is plain", () => {
	const view = render(
		<ShellIntentTitle
			intent={{ verb: "list", path: "apps" }}
			verb="Listing"
			running={true}
		/>,
	);
	expect(view.container.textContent).toBe("Listingapps");
	expect(view.queryByRole("button")).toBeNull();
});

test("a path typed in another directory shows as typed and opens where it ran", () => {
	const openLink = mock<OpenLink>(() => true);
	const view = render(
		<ChatPaneActionsProvider openLink={openLink}>
			<ShellIntentTitle
				intent={{ verb: "read", path: "index.ts", cwd: "/repo/src" }}
				verb="Read"
				running={false}
			/>
		</ChatPaneActionsProvider>,
	);
	const chip = view.getByRole("button");
	expect(chip.textContent).toBe("index.ts");
	fireEvent.click(chip);
	expect(openLink.mock.calls[0]?.[0]).toBe("/repo/src/index.ts");
});
