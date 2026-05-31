import type { ToolContext } from "../index.js";

const WINDOW_INFO_SCRIPT = `(() => ({
	title: document.title,
	url: window.location.href,
	viewportWidth: window.innerWidth,
	viewportHeight: window.innerHeight,
	focused: document.hasFocus(),
}))()`;

export function register({ server, getPage }: ToolContext) {
	server.registerTool(
		"get_window_info",
		{
			description:
				"Get information about the Electron app window: bounds, title, URL, focus state, and more.",
			inputSchema: {},
		},
		async () => {
			const page = await getPage();
			const info = (await page.evaluate(WINDOW_INFO_SCRIPT)) as {
				title: string;
				url: string;
				viewportWidth: number;
				viewportHeight: number;
				focused: boolean;
			};

			const viewport = page.viewport();
			const lines = [
				`Title: ${info.title}`,
				`URL: ${info.url}`,
				`Viewport: ${viewport?.width ?? info.viewportWidth}x${viewport?.height ?? info.viewportHeight}`,
				`Focused: ${info.focused}`,
			];

			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
			};
		},
	);
}
