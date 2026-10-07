const STOP_CHECK_ATTEMPTS = 8;
const STOP_CHECK_INTERVAL_MS = 250;

export async function waitForWorkspaceRunStop(
	isRunning: () => Promise<boolean>,
): Promise<boolean> {
	for (let attempt = 0; attempt < STOP_CHECK_ATTEMPTS; attempt++) {
		try {
			if (!(await isRunning())) return true;
		} catch {
			return false;
		}
		if (attempt < STOP_CHECK_ATTEMPTS - 1) {
			await new Promise((resolve) =>
				setTimeout(resolve, STOP_CHECK_INTERVAL_MS),
			);
		}
	}
	return false;
}
