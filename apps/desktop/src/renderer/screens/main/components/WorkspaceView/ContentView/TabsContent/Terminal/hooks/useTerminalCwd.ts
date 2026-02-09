import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { parseCwd } from "../parseCwd";

export interface UseTerminalCwdOptions {
	paneId: string;
	initialCwd: string | null | undefined;
	workspaceCwd: string | null | undefined;
}

export interface UseTerminalCwdReturn {
	terminalCwd: string | null;
	cwdConfirmed: boolean;
	updateCwdFromData: (data: string) => void;
}

export function useTerminalCwd({
	paneId,
	initialCwd,
	workspaceCwd,
}: UseTerminalCwdOptions): UseTerminalCwdReturn {
	const [terminalCwd, setTerminalCwd] = useState<string | null>(null);
	const [cwdConfirmed, setCwdConfirmed] = useState(false);
	const updatePaneCwd = useTabsStore((s) => s.updatePaneCwd);

	// Seed cwd; OSC-7 will override once the shell reports directory changes
	useEffect(() => {
		if (terminalCwd) return;
		const seedCwd = initialCwd || workspaceCwd;
		if (seedCwd) {
			setTerminalCwd(seedCwd);
			setCwdConfirmed(false);
		}
	}, [initialCwd, workspaceCwd, terminalCwd]);

	const debouncedUpdatePaneCwdRef = useRef(
		debounce((id: string, cwd: string | null, confirmed: boolean) => {
			updatePaneCwd(id, cwd, confirmed);
		}, 150),
	);

	useEffect(() => {
		debouncedUpdatePaneCwdRef.current(
			paneId,
			terminalCwd,
			cwdConfirmed ?? false,
		);
	}, [terminalCwd, cwdConfirmed, paneId]);

	useEffect(() => {
		const debouncedFn = debouncedUpdatePaneCwdRef.current;
		return () => {
			debouncedFn.cancel();
		};
	}, []);

	const updateCwdFromData = useCallback((data: string) => {
		const cwd = parseCwd(data);
		if (cwd !== null) {
			setTerminalCwd(cwd);
			setCwdConfirmed(true);
		}
	}, []);

	return {
		terminalCwd,
		cwdConfirmed,
		updateCwdFromData,
	};
}
