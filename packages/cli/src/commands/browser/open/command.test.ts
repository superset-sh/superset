import { describe, expect, mock, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import command from "./command";

const open = mock(async (input: { url: string }) => ({
	paneId: "pane-1",
	url: input.url,
}));
withLocalHostService("org-1", { "browser.open": open as never });

function invoke(show?: boolean, target?: string) {
	return command.run({
		ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
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
