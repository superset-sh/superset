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

/**
 * Hook to manage terminal current working directory (CWD) state.
 *
 * Handles:
 * - Initial CWD seeding from initialCwd or workspaceCwd
 * - Parsing OSC-7 sequences from terminal data to update CWD
 * - Debounced sync to tabs store for DirectoryNavigator
 */
export function useTerminalCwd({
	paneId,
	initialCwd,
	workspaceCwd,
}: UseTerminalCwdOptions): UseTerminalCwdReturn {
	const [terminalCwd, setTerminalCwd] = useState<string | null>(null);
	const [cwdConfirmed, setCwdConfirmed] = useState(false);
	const updatePaneCwd = useTabsStore((s) => s.updatePaneCwd);

	// Seed cwd from initialCwd or workspace path (shell spawns there)
	// OSC-7 will override if/when the shell reports directory changes
	useEffect(() => {
		if (terminalCwd) return; // Already have a cwd, don't override
		const seedCwd = initialCwd || workspaceCwd;
		if (seedCwd) {
			setTerminalCwd(seedCwd);
			setCwdConfirmed(false); // Seeded, not confirmed by OSC-7
		}
	}, [initialCwd, workspaceCwd, terminalCwd]);

	// Debounced CWD update to reduce store updates during rapid directory changes
	const debouncedUpdatePaneCwdRef = useRef(
		debounce((id: string, cwd: string | null, confirmed: boolean) => {
			updatePaneCwd(id, cwd, confirmed);
		}, 150),
	);

	// Sync terminal cwd to store for DirectoryNavigator (debounced)
	useEffect(() => {
		debouncedUpdatePaneCwdRef.current(
			paneId,
			terminalCwd,
			cwdConfirmed ?? false,
		);
	}, [terminalCwd, cwdConfirmed, paneId]);

	// Cleanup debounced function on unmount
	useEffect(() => {
		const debouncedFn = debouncedUpdatePaneCwdRef.current;
		return () => {
			debouncedFn.cancel();
		};
	}, []);

	// Parse terminal data for cwd (OSC 7 sequences)
	const updateCwdFromData = useCallback((data: string) => {
		const cwd = parseCwd(data);
		if (cwd !== null) {
			setTerminalCwd(cwd);
			setCwdConfirmed(true); // Confirmed by OSC-7
		}
	}, []);

	return {
		terminalCwd,
		cwdConfirmed,
		updateCwdFromData,
	};
}
