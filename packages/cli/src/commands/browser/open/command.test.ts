import { describe, expect, mock, test } from "bun:test";

const open = mock(async (input: { url: string }) => ({
	paneId: "pane-1",
	url: input.url,
}));
mock.module("../shared", () => ({
	resolveBrowserTarget: async () => ({
		client: { browser: { open: { mutate: open } } },
	}),
}));
const { default: command } = await import("./command");

function invoke(show?: boolean, target?: string) {
	return command.run({
		ctx: {} as never,
		args: {} as never,
		options: {
			workspace: "agent-workspace",
			url: "https://example.com",
			show,
			target,
		} as never,
		signal: new AbortController().signal,
	});
}

describe("browser open", () => {
	test("opens in the background by default, including new tabs", async () => {
		for (const target of [undefined, "new-tab"]) {
			await invoke(undefined, target);
			expect(open).toHaveBeenLastCalledWith({
				workspaceId: "agent-workspace",
				url: "https://example.com",
				target: target ?? "current-tab",
				show: false,
			});
		}
	});
	test("forwards an explicit request to show the browser", async () => {
		await invoke(true);
		expect(open).toHaveBeenLastCalledWith({
			workspaceId: "agent-workspace",
			url: "https://example.com",
			target: "current-tab",
			show: true,
		});
	});
});
