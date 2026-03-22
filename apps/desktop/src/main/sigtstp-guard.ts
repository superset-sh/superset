/**
 * Installs a SIGTSTP guard on Linux to prevent terminal job-control
 * (Ctrl-Z) from suspending the Electron GUI process.
 *
 * A stopped process cannot service Wayland/X11 events, so the window
 * manager reports it as unresponsive.
 */
export function installSigtstpGuard(): boolean {
	if (process.platform !== "linux") return false;
	process.on("SIGTSTP", () => {});
	return true;
}
