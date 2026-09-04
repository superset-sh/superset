"use client";

import { useEffect, useState } from "react";

export const Platform = {
	MacAppleSilicon: "mac-apple-silicon",
	MacIntel: "mac-intel",
	Windows: "windows",
	Linux: "linux",
	Mobile: "mobile",
	Unknown: "unknown",
} as const;

export type Platform = (typeof Platform)[keyof typeof Platform];

/**
 * Where the Mac architecture answer came from. Reported with the download
 * events so the analytics can tell a browser-confirmed arch from a default.
 */
export const ArchSource = {
	/** navigator.userAgentData.getHighEntropyValues(). */
	ClientHint: "client-hint",
	/** Browser exposes no architecture signal (Safari, Firefox). */
	Default: "default",
	/** Not a Mac, so no architecture was resolved. */
	NotMac: "not-mac",
} as const;

export type ArchSource = (typeof ArchSource)[keyof typeof ArchSource];

export interface PlatformInfo {
	platform: Platform;
	archSource: ArchSource;
}

interface UserAgentData {
	getHighEntropyValues?: (
		hints: string[],
	) => Promise<{ architecture?: string }>;
}

function userAgentData(): UserAgentData | undefined {
	return (navigator as Navigator & { userAgentData?: UserAgentData })
		.userAgentData;
}

/**
 * Normalises a UA Client Hints architecture string.
 *
 * The spec says "x86" and "arm" with bitness reported separately, but this
 * matches by prefix rather than equality: an engine answering "x86_64" would
 * otherwise fall through to the Apple Silicon default and hand a real Intel
 * Mac the wrong build, which is this same bug in the other direction.
 */
export function normalizeArch(
	value: string | null | undefined,
): "arm" | "x86" | null {
	const arch = value?.trim().toLowerCase();
	if (!arch) return null;
	if (arch.startsWith("x86") || arch.startsWith("amd64")) return "x86";
	if (arch.startsWith("arm")) return "arm";
	return null;
}

async function detectMacArch(): Promise<PlatformInfo> {
	// Never infer the CPU from the GPU. Reading the WebGL renderer string and
	// treating "not an Apple GPU" as proof of Intel handed Apple Silicon
	// visitors the x64 build, because that string reports a software or masked
	// renderer under software rendering and under fingerprint-resistant
	// browsers and extensions (issue #7036).
	try {
		const architecture = normalizeArch(
			(await userAgentData()?.getHighEntropyValues?.(["architecture"]))
				?.architecture,
		);
		if (architecture === "x86") {
			return { platform: Platform.MacIntel, archSource: ArchSource.ClientHint };
		}
		if (architecture === "arm") {
			return {
				platform: Platform.MacAppleSilicon,
				archSource: ArchSource.ClientHint,
			};
		}
	} catch {
		// Fall through to the default below.
	}

	// Safari and Firefox expose no architecture signal at all, so this is a
	// fallback rather than an answer. Apple last shipped an Intel Mac in 2023
	// and nearly every no-signal visitor is on Apple Silicon, so that is the
	// guess. The x64 build would run anywhere via Rosetta, but it needs a
	// Rosetta install prompt on a fresh machine and the updater keeps the
	// user on it forever, so guessing x64 mis-serves far more people than it
	// rescues. Callers must treat ArchSource.Default as "unconfirmed" and say
	// so rather than claiming to have detected the chip.
	return {
		platform: Platform.MacAppleSilicon,
		archSource: ArchSource.Default,
	};
}

/**
 * Resolves the visitor's platform from the user agent plus, on a Mac, the best
 * available architecture signal. Exported so the arch rules can be tested
 * without a DOM renderer; components use {@link usePlatform}.
 */
export async function detectPlatform(): Promise<PlatformInfo> {
	if (typeof navigator === "undefined") {
		return { platform: Platform.Unknown, archSource: ArchSource.NotMac };
	}

	const userAgent = navigator.userAgent;

	if (/android|iphone|ipad|ipod|mobile|tablet/i.test(userAgent)) {
		return { platform: Platform.Mobile, archSource: ArchSource.NotMac };
	}

	// macOS always reports "Intel Mac OS X" for compat, so the user agent says
	// nothing about the architecture. Only detectMacArch answers that.
	if (/mac os x|macintosh/i.test(userAgent)) {
		return detectMacArch();
	}
	if (/windows/i.test(userAgent)) {
		return { platform: Platform.Windows, archSource: ArchSource.NotMac };
	}
	if (/linux|x11/i.test(userAgent)) {
		return { platform: Platform.Linux, archSource: ArchSource.NotMac };
	}
	return { platform: Platform.Unknown, archSource: ArchSource.NotMac };
}

export function isMacPlatform(platform: Platform): boolean {
	return (
		platform === Platform.MacAppleSilicon || platform === Platform.MacIntel
	);
}

const DEFAULT_PLATFORM: PlatformInfo = {
	platform: Platform.Unknown,
	archSource: ArchSource.NotMac,
};

/** Resolves the visitor's platform after mount. */
export function usePlatform(): PlatformInfo {
	const [info, setInfo] = useState<PlatformInfo>(DEFAULT_PLATFORM);

	useEffect(() => {
		let cancelled = false;
		void detectPlatform().then((next) => {
			if (!cancelled) setInfo(next);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return info;
}
