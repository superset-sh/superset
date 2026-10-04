import type { BrowserWindow } from "electron";

export async function openInitialWindow({
	guardWebContents,
	restoreWindows,
	getAllWindows,
	createWindow,
}: {
	guardWebContents: () => void;
	restoreWindows?: () => Promise<void>;
	getAllWindows: () => BrowserWindow[];
	createWindow: () => Promise<BrowserWindow>;
}): Promise<BrowserWindow> {
	// `web-contents-created` never fires for contents that already exist.
	guardWebContents();
	if (restoreWindows) {
		await restoreWindows();
	}
	const [existing] = getAllWindows();
	return existing ?? (await createWindow());
}
