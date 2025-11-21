import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import { debounce } from "lodash";
import { useEffect, useRef } from "react";
import { trpc } from "renderer/lib/trpc";
import { RESIZE_DEBOUNCE_MS, TERMINAL_OPTIONS } from "./config";

interface TerminalProps {
	tabId: string;
	workspaceId: string;
}

function createTerminalInstance(container: HTMLDivElement): {
	xterm: XTerm;
	fitAddon: FitAddon;
} {
	const xterm = new XTerm(TERMINAL_OPTIONS);
	const fitAddon = new FitAddon();
	const webLinksAddon = new WebLinksAddon();

	xterm.loadAddon(fitAddon);
	xterm.loadAddon(webLinksAddon);
	xterm.open(container);
	fitAddon.fit();

	return { xterm, fitAddon };
}

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const isExitedRef = useRef(false);

	const createOrAttach = trpc.terminal.createOrAttach.useMutation();
	const write = trpc.terminal.write.useMutation();
	const resize = trpc.terminal.resize.useMutation();
	const detach = trpc.terminal.detach.useMutation();

	const handleStreamData = (
		event: { type: "data"; data: string } | { type: "exit"; exitCode: number },
	) => {
		if (!xtermRef.current) return;

		if (event.type === "data") {
			xtermRef.current.write(event.data);
		} else if (event.type === "exit") {
			isExitedRef.current = true;
			xtermRef.current.writeln(
				`\r\n\r\n[Process exited with code ${event.exitCode}]`,
			);
			xtermRef.current.writeln("[Press any key to restart]");
		}
	};

	trpc.terminal.stream.useSubscription(tabId, {
		onData: handleStreamData,
	});

	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		const { xterm, fitAddon } = createTerminalInstance(container);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		isExitedRef.current = false;

		const restartTerminal = () => {
			isExitedRef.current = false;
			xterm.clear();
			createOrAttach.mutate({
				tabId,
				workspaceId,
				cols: xterm.cols,
				rows: xterm.rows,
			});
		};

		const handleTerminalInput = (data: string) => {
			if (isExitedRef.current) {
				restartTerminal();
			} else {
				write.mutate({ tabId, data });
			}
		};

		createOrAttach.mutate(
			{
				tabId,
				workspaceId,
				cols: xterm.cols,
				rows: xterm.rows,
			},
			{
				onSuccess: (result) => {
					if (!result.isNew && result.scrollback.length > 0) {
						xterm.write(result.scrollback[0]);
					}
				},
			},
		);

		const inputDisposable = xterm.onData(handleTerminalInput);

		const debouncedResize = debounce((cols: number, rows: number) => {
			resize.mutate({ tabId, cols, rows });
		}, RESIZE_DEBOUNCE_MS);

		const handleResize = () => {
			fitAddon.fit();
			debouncedResize(xterm.cols, xterm.rows);
		};

		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(container);
		window.addEventListener("resize", handleResize);

		return () => {
			inputDisposable.dispose();
			window.removeEventListener("resize", handleResize);
			resizeObserver.disconnect();
			debouncedResize.cancel();
			detach.mutate({ tabId });
			xterm.dispose();
		};
		// Dependencies intentionally minimal to avoid recreating terminal on every state change
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tabId, workspaceId]);

	return (
		<div className="h-full w-full overflow-hidden bg-black">
			<div ref={terminalRef} className="h-full w-full p-2" />
		</div>
	);
};
