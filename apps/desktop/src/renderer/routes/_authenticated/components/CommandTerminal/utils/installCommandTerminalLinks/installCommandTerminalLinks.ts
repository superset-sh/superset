import type { Terminal } from "@xterm/xterm";
import { UrlLinkProvider } from "renderer/lib/terminal/links/url-link-provider";

export function installCommandTerminalLinks(
	terminal: Terminal,
	openUrl: (url: string) => void,
) {
	const previousHandler = terminal.options.linkHandler;
	const activate = (event: MouseEvent, uri: string) => {
		if (!/^https?:\/\//i.test(uri)) return;
		event.preventDefault();
		openUrl(uri);
	};
	terminal.options.linkHandler = { allowNonHttpProtocols: false, activate };
	const provider = terminal.registerLinkProvider(
		new UrlLinkProvider(terminal, activate),
	);
	return () => {
		provider.dispose();
		terminal.options.linkHandler = previousHandler;
	};
}
