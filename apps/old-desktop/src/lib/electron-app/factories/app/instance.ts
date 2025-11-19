import { app } from "electron";

export function makeAppWithSingleInstanceLock(fn: () => void) {
	const isPrimaryInstance = app.requestSingleInstanceLock();

	!isPrimaryInstance ? app.quit() : fn();
}
