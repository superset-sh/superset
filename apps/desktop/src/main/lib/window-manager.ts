import type { BrowserWindow } from "electron";
import { MainWindow } from "../windows/main";

class WindowManager {
	private windows: Set<BrowserWindow> = new Set();

	async createWindow(): Promise<BrowserWindow> {
		const window = await MainWindow();
		this.windows.add(window);

		window.on("closed", () => {
			this.windows.delete(window);
		});

		return window;
	}

	getWindows(): BrowserWindow[] {
		return Array.from(this.windows);
	}

	getWindowCount(): number {
		return this.windows.size;
	}
}

export default new WindowManager();
