/**
 * Storage-related IPC channels for electron-store persistence
 */

export interface StorageChannels {
	"storage:get": {
		request: { key: string };
		response: any;
	};

	"storage:set": {
		request: { key: string; value: any };
		response: void;
	};

	"storage:delete": {
		request: { key: string };
		response: void;
	};
}
