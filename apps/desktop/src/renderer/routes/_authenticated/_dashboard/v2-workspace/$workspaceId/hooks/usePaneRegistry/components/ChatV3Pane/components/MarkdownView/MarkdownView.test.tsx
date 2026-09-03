import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ReactNode } from "react";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const openFile = mock(
	async (
		_path: string,
		_event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
	) => {},
);

mock.module("renderer/lib/clickPolicy", () => ({
	ClickHint: ({ children }: { children: ReactNode }) => children,
}));
mock.module("../../providers/MarkdownFileLinkProvider", () => ({
	useMarkdownFileLink: () => ({ hint: "Command click: open", open: openFile }),
}));

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { MarkdownView } = await import("./MarkdownView");

beforeEach(() => openFile.mockClear());
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test("routes a local Markdown link through the workspace file handler", () => {
	const view = render(
		<MarkdownView text="[Open preview](/tmp/my%20preview.png)" />,
	);
	const link = view.getByRole("link", { name: "Open preview" });

	fireEvent.click(link, { metaKey: true });

	expect(openFile).toHaveBeenCalledTimes(1);
	expect(openFile.mock.calls[0]?.[0]).toBe("/tmp/my preview.png");
	expect(openFile.mock.calls[0]?.[1].metaKey).toBe(true);
});

test("keeps web URLs on the regular external-link path", () => {
	const view = render(
		<MarkdownView text="[Superset](https://superset.sh/docs)" />,
	);
	const link = view.getByRole("link", { name: "Superset" });

	expect(link.getAttribute("href")).toBe("https://superset.sh/docs");
	expect(link.getAttribute("target")).toBe("_blank");
	expect(openFile).not.toHaveBeenCalled();
});
