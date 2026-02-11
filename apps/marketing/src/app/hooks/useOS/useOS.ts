import { useEffect, useState } from "react";
import { UAParser } from "ua-parser-js";

export type OS = "macos" | "windows" | "linux" | "unknown";

export interface PlatformInfo {
	os: OS;
	isMobile: boolean;
}

function detectPlatform(): PlatformInfo {
	if (typeof navigator === "undefined") {
		return { os: "unknown", isMobile: false };
	}

	const parser = new UAParser(navigator.userAgent);
	const osName = parser.getOS().name?.toLowerCase() ?? "";
	const deviceType = parser.getDevice().type;

	const isMobile = deviceType === "mobile" || deviceType === "tablet";

	let os: OS = "unknown";
	if (osName.includes("mac")) os = "macos";
	else if (osName.includes("windows")) os = "windows";
	else if (osName.includes("linux")) os = "linux";

	return { os, isMobile };
}

const DEFAULT_PLATFORM: PlatformInfo = { os: "unknown", isMobile: false };

export function usePlatform(): PlatformInfo {
	const [platform, setPlatform] = useState<PlatformInfo>(DEFAULT_PLATFORM);

	useEffect(() => {
		setPlatform(detectPlatform());
	}, []);

	return platform;
}
