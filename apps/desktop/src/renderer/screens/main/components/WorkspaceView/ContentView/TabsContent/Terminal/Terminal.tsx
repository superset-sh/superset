import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import { debounce } from "lodash";
import { useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useSetActiveTab } from "renderer/stores";
import { RESIZE_DEBOUNCE_MS, TERMINAL_OPTIONS } from "./config";

interface TerminalProps {
	tabId: string;
	workspaceId: string;
}

type TerminalStreamEvent =
	| { type: "data"; data: string }
	| { type: "exit"; exitCode: number };

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
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
	const setActiveTab = useSetActiveTab();

	const createOrAttachMutation = trpc.terminal.createOrAttach.useMutation();
	const writeMutation = trpc.terminal.write.useMutation();
	const resizeMutation = trpc.terminal.resize.useMutation();
	const detachMutation = trpc.terminal.detach.useMutation();

	// Avoid effect re-runs when mutations change
	const createOrAttachRef = useRef(createOrAttachMutation.mutate);
	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	const detachRef = useRef(detachMutation.mutate);

	createOrAttachRef.current = createOrAttachMutation.mutate;
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;
	detachRef.current = detachMutation.mutate;

	const flushPendingEvents = () => {
		if (!xtermRef.current || pendingEventsRef.current.length === 0) return;
		const events = pendingEventsRef.current.splice(
			0,
			pendingEventsRef.current.length,
		);
		for (const event of events) {
			if (event.type === "data") {
				xtermRef.current.write(event.data);
			} else {
				isExitedRef.current = true;
				setSubscriptionEnabled(false);
				xtermRef.current.writeln(
					`\r\n\r\n[Process exited with code ${event.exitCode}]`,
				);
				xtermRef.current.writeln("[Press any key to restart]");
			}
		}
	};

	const handleStreamData = (event: TerminalStreamEvent) => {
		if (!xtermRef.current) {
			pendingEventsRef.current.push(event);
			return;
		}

		if (event.type === "data") {
			xtermRef.current.write(event.data);
		} else if (event.type === "exit") {
			isExitedRef.current = true;
			setSubscriptionEnabled(false);
			xtermRef.current.writeln(
				`\r\n\r\n[Process exited with code ${event.exitCode}]`,
			);
			xtermRef.current.writeln("[Press any key to restart]");
		}
	};

	trpc.terminal.stream.useSubscription(tabId, {
		onData: handleStreamData,
		enabled: subscriptionEnabled,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: flushPendingEvents is intentionally excluded - it's stable and only called during initialization
	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		const { xterm, fitAddon } = createTerminalInstance(container);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		isExitedRef.current = false;
		setSubscriptionEnabled(true);
		flushPendingEvents();

		const restartTerminal = () => {
			isExitedRef.current = false;
			setSubscriptionEnabled(false);
			xterm.clear();
			createOrAttachRef.current(
				{
					tabId,
					workspaceId,
					cols: xterm.cols,
					rows: xterm.rows,
				},
				{
					onSuccess: () => {
						setSubscriptionEnabled(true);
					},
				},
			);
		};

		const handleTerminalInput = (data: string) => {
			// Read current state instead of relying on closure
			if (isExitedRef.current) {
				restartTerminal();
			} else {
				writeRef.current({ tabId, data });
			}
		};

		createOrAttachRef.current(
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

		// Activate tab when terminal receives focus (same logic as sidebar tab click)
		const textarea = xterm.textarea;
		const handleFocus = () => {
			setActiveTab(workspaceId, tabId);
		};
		if (textarea) {
			textarea.addEventListener("focus", handleFocus);
		}

		const debouncedResize = debounce((cols: number, rows: number) => {
			resizeRef.current({ tabId, cols, rows });
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
			if (textarea) {
				textarea.removeEventListener("focus", handleFocus);
			}
			window.removeEventListener("resize", handleResize);
			resizeObserver.disconnect();
			debouncedResize.cancel();
			// Keep PTY running for reattachment
			detachRef.current({ tabId });
			setSubscriptionEnabled(false);
			xterm.dispose();
			xtermRef.current = null;
		};
	}, [tabId, workspaceId, setActiveTab]);

	return (
		<div className="h-full w-full overflow-hidden bg-black">
			<div ref={terminalRef} className="h-full w-full p-2" />
		</div>
	);
};
