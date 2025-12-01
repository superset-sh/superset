/**
 * Storage-related IPC channels for electron-store persistence
 */

export interface StorageChannels {
	"storage:get": {
		request: { key: string };
		response: unknown;
	};

	"storage:set": {
		request: { key: string; value: unknown };
		response: undefined;
	};

	"storage:delete": {
		request: { key: string };
		response: undefined;
	};
}
