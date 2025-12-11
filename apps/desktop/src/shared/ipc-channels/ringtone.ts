/**
 * Ringtone-related IPC channels
 */

import type { IpcResponse, NoRequest } from "./types";

export interface RingtoneChannels {
	/**
	 * Preview a ringtone sound by filename
	 */
	"ringtone:preview": {
		request: { filename: string };
		response: IpcResponse;
	};

	/**
	 * Stop the currently playing ringtone preview
	 */
	"ringtone:stop": {
		request: NoRequest;
		response: IpcResponse;
	};

	/**
	 * Get the list of available ringtone files
	 */
	"ringtone:list": {
		request: NoRequest;
		response: IpcResponse<string[]>;
	};
}
