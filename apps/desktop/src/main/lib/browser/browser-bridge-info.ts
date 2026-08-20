/**
 * Browser bridge endpoint + secret, published once the bridge binds. Kept in
 * its own module (no electron/express/ws imports) so the host-service
 * coordinator can read it without pulling the whole bridge — and its
 * transitive `electron.shell` import — into unit tests.
 */

export interface BrowserBridgeInfo {
	endpoint: string;
	secret: string;
}

let bridgeInfo: BrowserBridgeInfo | null = null;

export function getBrowserBridgeInfo(): BrowserBridgeInfo | null {
	return bridgeInfo;
}

export function setBrowserBridgeInfo(info: BrowserBridgeInfo): void {
	bridgeInfo = info;
}
