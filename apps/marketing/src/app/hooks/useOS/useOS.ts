import { useEffect, useState } from "react";
import { UAParser } from "ua-parser-js";

export type OS = "macos" | "windows" | "linux" | "unknown";
export type MacArch = "arm64" | "x64" | "unknown";

export interface PlatformInfo {
	os: OS;
	isMobile: boolean;
	macArch: MacArch;
}

function detectPlatform(): PlatformInfo {
	if (typeof navigator === "undefined") {
		return { os: "unknown", isMobile: false, macArch: "unknown" };
	}

	const parser = new UAParser(navigator.userAgent);
	const osName = parser.getOS().name?.toLowerCase() ?? "";
	const deviceType = parser.getDevice().type;

	const isMobile = deviceType === "mobile" || deviceType === "tablet";

	let os: OS = "unknown";
	if (osName.includes("mac")) os = "macos";
	else if (osName.includes("windows")) os = "windows";
	else if (osName.includes("linux")) os = "linux";

	return { os, isMobile, macArch: "unknown" };
}

async function detectMacArch(): Promise<MacArch> {
	if (typeof navigator === "undefined") return "unknown";

	// Chromium browsers: use high-entropy UA data
	if ("userAgentData" in navigator && navigator.userAgentData) {
		try {
			const ua = navigator.userAgentData as NavigatorUABrandVersion;
			const values = await ua.getHighEntropyValues(["architecture"]);
			if (values.architecture === "arm") return "arm64";
			if (values.architecture === "x86") return "x64";
		} catch {
			// Fall through to WebGL detection
		}
	}

	// Safari / fallback: check WebGL renderer for Apple Silicon vs Intel
	try {
		const canvas = document.createElement("canvas");
		const gl =
			canvas.getContext("webgl2") || canvas.getContext("webgl");
		if (gl) {
			const debugExt = gl.getExtension("WEBGL_debug_renderer_info");
			if (debugExt) {
				const renderer = gl.getParameter(
					debugExt.UNMASKED_RENDERER_WEBGL,
				) as string;
				if (/apple m\d/i.test(renderer) || /apple gpu/i.test(renderer)) {
					return "arm64";
				}
				if (/intel/i.test(renderer)) {
					return "x64";
				}
			}
		}
	} catch {
		// WebGL not available
	}

	// Default to arm64 — most modern Macs are Apple Silicon
	return "arm64";
}

interface NavigatorUABrandVersion {
	getHighEntropyValues(
		hints: string[],
	): Promise<{ architecture?: string }>;
}

const DEFAULT_PLATFORM: PlatformInfo = {
	os: "unknown",
	isMobile: false,
	macArch: "unknown",
};

export function usePlatform(): PlatformInfo {
	const [platform, setPlatform] = useState<PlatformInfo>(DEFAULT_PLATFORM);

	useEffect(() => {
		const info = detectPlatform();
		setPlatform(info);

		if (info.os === "macos") {
			detectMacArch().then((arch) => {
				setPlatform((prev) => ({ ...prev, macArch: arch }));
			});
		}
	}, []);

	return platform;
}
