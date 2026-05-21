import { useEffect, useState } from "react";
import { UAParser } from "ua-parser-js";

export const Platform = {
	MacAppleSilicon: "mac-apple-silicon",
	MacIntel: "mac-intel",
	Windows: "windows",
	Linux: "linux",
	Mobile: "mobile",
	Unknown: "unknown",
} as const;

export type Platform = (typeof Platform)[keyof typeof Platform];

export interface PlatformInfo {
	platform: Platform;
}

function detectMacArch():
	| typeof Platform.MacAppleSilicon
	| typeof Platform.MacIntel {
	// Browser-side arch detection is unreliable: navigator.userAgent always
	// reports "Intel Mac OS X" on Apple Silicon for compat. The most reliable
	// signal that works in Safari is the WebGL renderer string — Apple GPUs
	// expose "Apple GPU" / "Apple M*", Intel Macs expose Intel/AMD/Nvidia.
	try {
		const canvas = document.createElement("canvas");
		const gl =
			canvas.getContext("webgl") ||
			(canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
		if (!gl) return Platform.MacAppleSilicon;
		const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
		if (!debugInfo) return Platform.MacAppleSilicon;
		const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as
			| string
			| undefined;
		if (typeof renderer !== "string") return Platform.MacAppleSilicon;
		return renderer.toLowerCase().includes("apple")
			? Platform.MacAppleSilicon
			: Platform.MacIntel;
	} catch {
		return Platform.MacAppleSilicon;
	}
}

function detectPlatform(): PlatformInfo {
	if (typeof navigator === "undefined") {
		return { platform: Platform.Unknown };
	}

	const parser = new UAParser(navigator.userAgent);
	const osName = parser.getOS().name?.toLowerCase() ?? "";
	const deviceType = parser.getDevice().type;

	if (deviceType === "mobile" || deviceType === "tablet") {
		return { platform: Platform.Mobile };
	}

	if (osName.includes("mac")) {
		return { platform: detectMacArch() };
	}
	if (osName.includes("windows")) {
		return { platform: Platform.Windows };
	}
	if (osName.includes("linux")) {
		return { platform: Platform.Linux };
	}
	return { platform: Platform.Unknown };
}

const DEFAULT_PLATFORM: PlatformInfo = { platform: Platform.Unknown };

export function usePlatform(): PlatformInfo {
	const [platform, setPlatform] = useState<PlatformInfo>(DEFAULT_PLATFORM);

	useEffect(() => {
		setPlatform(detectPlatform());
	}, []);

	return platform;
}

export function isMacPlatform(platform: Platform): boolean {
	return (
		platform === Platform.MacAppleSilicon || platform === Platform.MacIntel
	);
}
