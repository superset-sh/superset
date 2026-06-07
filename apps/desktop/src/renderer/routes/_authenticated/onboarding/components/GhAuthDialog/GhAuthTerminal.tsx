import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import {
	attachToContainer,
	createRuntime,
	disposeRuntime,
} from "renderer/lib/terminal/terminal-runtime";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTerminalAppearance } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/hooks/useTerminalAppearance";

const GH_AUTH_COMMAND =
	"gh auth login --hostname github.com --git-protocol https --web";

interface GhAuthTerminalProps {
	/** Fired when the gh process exits (success or failure). */
	onExit: () => void;
}

export function GhAuthTerminal({ onExit }: GhAuthTerminalProps) {
	const appearance = useTerminalAppearance();
	const appearanceRef = useRef(appearance);
	appearanceRef.current = appearance;
	const containerRef = useRef<HTMLDivElement>(null);
	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const paneId = `onboarding-gh-auth-${crypto.randomUUID()}`;
		const runtime = createRuntime(paneId, appearanceRef.current);
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

		const inputDisposable = runtime.terminal.onData((data) => {
			void electronTrpcClient.terminal.write.mutate({ paneId, data });
		});

		let exited = false;
		const subscription = electronTrpcClient.terminal.stream.subscribe(paneId, {
			onData: (event) => {
				if (event.type === "data") {
					runtime.terminal.write(event.data);
				} else if (event.type === "exit" && !exited) {
					exited = true;
					onExitRef.current();
				}
			},
		});

		void electronTrpcClient.terminal.createOrAttach.mutate({
			paneId,
			tabId: paneId,
			workspaceId: paneId,
			command: GH_AUTH_COMMAND,
			cols: runtime.terminal.cols,
			rows: runtime.terminal.rows,
			skipColdRestore: true,
		});

		return () => {
			for (const timer of refitTimers) window.clearTimeout(timer);
			inputDisposable.dispose();
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
