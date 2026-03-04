import { mock } from "bun:test";

type ElectronTestMock = {
	screen: {
		getPrimaryDisplay: ReturnType<typeof mock>;
		getAllDisplays: ReturnType<typeof mock>;
	};
	BrowserWindow: {
		getAllWindows: ReturnType<typeof mock>;
	};
};

const ELECTRON_TEST_MOCK_KEY = "__supersetElectronTestMock__";
const globalWithElectronMock = globalThis as typeof globalThis & {
	[ELECTRON_TEST_MOCK_KEY]?: ElectronTestMock;
};

if (!globalWithElectronMock[ELECTRON_TEST_MOCK_KEY]) {
	globalWithElectronMock[ELECTRON_TEST_MOCK_KEY] = {
		screen: {
			getPrimaryDisplay: mock(() => ({
				workAreaSize: { width: 1920, height: 1080 },
				bounds: { x: 0, y: 0, width: 1920, height: 1080 },
			})),
			getAllDisplays: mock(() => [
				{
					bounds: { x: 0, y: 0, width: 1920, height: 1080 },
					workAreaSize: { width: 1920, height: 1080 },
				},
			]),
		},
		BrowserWindow: {
			getAllWindows: mock(() => []),
		},
	};
}

export const electronTestMock = globalWithElectronMock[ELECTRON_TEST_MOCK_KEY];
