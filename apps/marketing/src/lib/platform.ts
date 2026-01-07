export function isMacOSUserAgent(userAgent: string) {
	const ua = userAgent.toLowerCase();
	const isIOS =
		ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod");
	return (ua.includes("macintosh") || ua.includes("mac os x")) && !isIOS;
}
