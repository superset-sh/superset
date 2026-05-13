import type { Session } from "electron";

// Google's OAuth endpoints reject requests whose User-Agent looks like an
// embedded browser (returns `disallowed_useragent` / "This browser or app
// may not be secure"). Electron's default UA contains an `Electron/x.y.z`
// token, so we strip it for requests to Google sign-in hostnames and let
// the Chrome token already present in the UA stand in.
const GOOGLE_OAUTH_HOSTS = new Set([
	"accounts.google.com",
	"accounts.youtube.com",
	"myaccount.google.com",
]);

export function isGoogleOAuthUrl(url: string): boolean {
	try {
		const { protocol, hostname } = new URL(url);
		if (protocol !== "http:" && protocol !== "https:") return false;
		return GOOGLE_OAUTH_HOSTS.has(hostname.toLowerCase());
	} catch {
		return false;
	}
}

export function stripElectronFromUserAgent(ua: string): string {
	return ua
		.replace(/\s*Electron\/\S+/gi, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function registerGoogleOAuthUserAgentSpoofing(session: Session): void {
	session.webRequest.onBeforeSendHeaders((details, callback) => {
		if (!isGoogleOAuthUrl(details.url)) {
			callback({ requestHeaders: details.requestHeaders });
			return;
		}
		const headers = { ...details.requestHeaders };
		const currentUa = headers["User-Agent"] ?? headers["user-agent"];
		if (typeof currentUa === "string" && /Electron\//i.test(currentUa)) {
			headers["User-Agent"] = stripElectronFromUserAgent(currentUa);
			delete headers["user-agent"];
		}
		callback({ requestHeaders: headers });
	});
}
