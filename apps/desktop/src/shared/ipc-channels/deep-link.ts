/**
 * Deep linking IPC channels
 */

import type { NoRequest } from "./types";

export interface DeepLinkChannels {
	"deep-link-get-url": {
		request: NoRequest;
		response: string | null;
	};
}

