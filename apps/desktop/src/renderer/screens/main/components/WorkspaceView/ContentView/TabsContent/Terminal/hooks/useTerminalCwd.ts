import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { parseCwd } from "../parseCwd";

export interface UseTerminalCwdOptions {
	paneId: string;
	/** Initial CWD from pane data (e.g., initialCwd) */
	initialCwd?: string | null;
	/** Workspace CWD as fallback seed */
	workspaceCwd?: string | null;
}

export interface UseTerminalCwdResult {
	/** Current terminal CWD */
	terminalCwd: string | null;
	/** Whether CWD has been confirmed by OSC-7 (vs seeded from initialCwd) */
	cwdConfirmed: boolean;
	/** Update CWD from terminal output data (parses OSC-7 sequences) */
	updateCwdFromData: (data: string) => void;
	/** Ref to updateCwdFromData for use inside effects */
	updateCwdRef: React.RefObject<(data: string) => void>;
	/** Set CWD directly (e.g., from restore data) */
	setTerminalCwd: (cwd: string | null) => void;
}

/**
 * Hook to manage terminal current working directory.
 *
 * Encapsulates:
 * - OSC-7 parsing to extract CWD from terminal output
 * - CWD seeding from initialCwd or workspaceCwd
 * - Debounced store updates to reduce store churn
 * - CWD confirmation tracking (seeded vs OSC-7 confirmed)
 */
export function useTerminalCwd({
	paneId,
	initialCwd,
	workspaceCwd,
}: UseTerminalCwdOptions): UseTerminalCwdResult {
	const [terminalCwd, setTerminalCwd] = useState<string | null>(null);
	const [cwdConfirmed, setCwdConfirmed] = useState(false);

	const updatePaneCwd = useTabsStore((s) => s.updatePaneCwd);

	// Debounced CWD update to reduce store updates during rapid directory changes
	const debouncedUpdatePaneCwdRef = useRef(
		debounce((id: string, cwd: string | null, confirmed: boolean) => {
			updatePaneCwd(id, cwd, confirmed);
		}, 150),
	);

	// Parse terminal data for cwd (OSC 7 sequences)
	const updateCwdFromData = useCallback((data: string) => {
		const cwd = parseCwd(data);
		if (cwd !== null) {
			setTerminalCwd(cwd);
			setCwdConfirmed(true); // Confirmed by OSC-7
		}
	}, []);

	// Ref for use inside effects
	const updateCwdRef = useRef(updateCwdFromData);
	updateCwdRef.current = updateCwdFromData;

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

	// Sync terminal cwd to store for DirectoryNavigator (debounced)
	useEffect(() => {
		debouncedUpdatePaneCwdRef.current(paneId, terminalCwd, cwdConfirmed);
	}, [terminalCwd, cwdConfirmed, paneId]);

	// Cleanup debounced function on unmount
	useEffect(() => {
		const debouncedFn = debouncedUpdatePaneCwdRef.current;
		return () => {
			debouncedFn.cancel();
		};
	}, []);

	return {
		terminalCwd,
		cwdConfirmed,
		updateCwdFromData,
		updateCwdRef,
		setTerminalCwd,
	};
}
