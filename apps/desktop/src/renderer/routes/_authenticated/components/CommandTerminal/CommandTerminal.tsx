import "@xterm/xterm/css/xterm.css";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef } from "react";
import {
	attachToContainer,
	createRuntime,
	disposeRuntime,
} from "renderer/lib/terminal/terminal-runtime";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTerminalAppearance } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/hooks/useTerminalAppearance";
import { installCommandTerminalLinks } from "./utils/installCommandTerminalLinks";

interface CommandTerminalProps {
	command: string;
	onExit: (exitCode: number | null) => void;
	onOutput?: (data: string) => void;
	/** Receives a writer for sending input to the pty (queued until it exists). */
	onWriterReady?: (write: (data: string) => void) => void;
}

export function CommandTerminal({
	command,
	onExit,
	onOutput,
	onWriterReady,
}: CommandTerminalProps) {
	const appearance = useTerminalAppearance();
	const appearanceRef = useRef(appearance);
	appearanceRef.current = appearance;
	const containerRef = useRef<HTMLDivElement>(null);
	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;
	const onOutputRef = useRef(onOutput);
	onOutputRef.current = onOutput;
	const onWriterReadyRef = useRef(onWriterReady);
	onWriterReadyRef.current = onWriterReady;
	const commandRef = useRef(command);
	commandRef.current = command;

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const paneId = `command-terminal-${crypto.randomUUID()}`;
		const runtime = createRuntime(paneId, appearanceRef.current);
		const disposeLinks = installCommandTerminalLinks(
			runtime.terminal,
			(url) => {
				void electronTrpcClient.external.openUrl
					.mutate(url)
					.catch((error: unknown) => {
						toast.error(errorMessage(error));
					});
			},
		);
		const syncSize = () => {
			void electronTrpcClient.terminal.resize.mutate({
				paneId,
				cols: runtime.terminal.cols,
				rows: runtime.terminal.rows,
			});
		};
		attachToContainer(runtime, container, syncSize);

		// The dialog animates in, so the container often lacks final dimensions
		// at mount and the initial fit measures wrong. Refit once the dialog has
		// settled, then push the corrected size to the PTY.
		const refit = () => {
			if (!containerRef.current) return;
			runtime.fitAddon.fit();
			syncSize();
		};
		const refitTimers = [
			window.setTimeout(refit, 100),
			window.setTimeout(refit, 350),
		];

		// Queue input until the pane exists: xterm auto-replies to terminal
		// queries (OSC 11, DSR) at mount, and a write to a not-yet-created pane
		// makes the terminal service synthesize an exit event for it.
		let disposed = false;
		let paneReady = false;
		let exited = false;
		let exitBeforeReady: number | null = null;
		const pendingInput: string[] = [];
		const fireExit = (exitCode: number | null) => {
			if (disposed || exited) return;
			exited = true;
			onExitRef.current(exitCode);
		};

		const writeToPty = (data: string) => {
			if (disposed || exited) return;
			if (!paneReady) {
				pendingInput.push(data);
				return;
			}
			void electronTrpcClient.terminal.write.mutate({ paneId, data });
		};
		const inputDisposable = runtime.terminal.onData(writeToPty);
		onWriterReadyRef.current?.(writeToPty);

		const subscription = electronTrpcClient.terminal.stream.subscribe(paneId, {
			onData: (event) => {
				if (event.type === "data") {
					runtime.terminal.write(event.data);
					onOutputRef.current?.(event.data);
				} else if (event.type === "exit") {
					const exitCode = event.signal ? 128 + event.signal : event.exitCode;
					if (paneReady) fireExit(exitCode);
					else exitBeforeReady = exitCode;
				}
			},
		});

		void electronTrpcClient.terminal.createOrAttach
			.mutate({
				paneId,
				tabId: paneId,
				workspaceId: paneId,
				command: commandRef.current,
				cols: runtime.terminal.cols,
				rows: runtime.terminal.rows,
				skipColdRestore: true,
			})
			.then(() => {
				if (disposed) {
					void electronTrpcClient.terminal.kill.mutate({ paneId });
					return;
				}
				paneReady = true;
				for (const data of pendingInput.splice(0)) {
					void electronTrpcClient.terminal.write.mutate({ paneId, data });
				}
				if (exitBeforeReady !== null) fireExit(exitBeforeReady);
			})
			// A failed create would otherwise leave the dialog running forever
			// with a dead terminal silently swallowing queued input.
			.catch(() => fireExit(null));

		return () => {
			disposed = true;
			for (const timer of refitTimers) window.clearTimeout(timer);
			inputDisposable.dispose();
			disposeLinks();
			subscription.unsubscribe();
			void electronTrpcClient.terminal.kill.mutate({ paneId });
			disposeRuntime(runtime);
		};
	}, []);

	return (
		<div className="relative h-full w-full overflow-hidden">
			<div ref={containerRef} className="h-full w-full" />
		</div>
	);
}
