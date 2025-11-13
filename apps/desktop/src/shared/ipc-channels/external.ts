/**
 * External operations IPC channels
 */

import type { NoRequest, NoResponse, SuccessResponse } from "./types";

export interface ExternalChannels {
	"open-external": {
		request: string;
		response: NoResponse;
	};

	"open-app-settings": {
		request: NoRequest;
		response: SuccessResponse;
	};
}

