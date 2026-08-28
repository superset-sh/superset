/**
 * Client Hints values matching what real desktop Chrome reports. Chromium
 * generates `sec-ch-ua*` headers and `navigator.userAgentData` from its own
 * UserAgentMetadata, which `session.setUserAgent()` does not touch — so both
 * the request headers (main process, user-agent.ts) and the page-visible JS
 * object (preload, browser-client-hints.ts) are rebuilt from these shared
 * functions, seeded by the same `process.versions.chrome`, so they can never
 * disagree with the UA string.
 */

export interface BrandVersion {
	brand: string;
	version: string;
}

/**
 * Chromium's GREASE brand algorithm, ported verbatim from
 * components/embedder_support/user_agent_utils.cc: the fake brand's
 * punctuation, its version, and the shuffle order of the whole list are all
 * deterministic functions of the major version, and bot-detection scripts
 * check them — a wrong token or ordering is itself a fingerprint.
 */
const GREASE_CHARS = [" ", "(", ":", "-", ".", "/", ")", ";", "=", "?", "_"];
const GREASE_VERSIONS = ["8", "99", "24"];
const BRAND_LIST_ORDERS = [
	[0, 1, 2],
	[0, 2, 1],
	[1, 0, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0],
];

export function chromeMajorVersion(chromeVersion: string): number {
	return Number.parseInt(chromeVersion.split(".")[0], 10);
}

/**
 * The three-entry brand list real Chrome sends for a given Chromium version.
 * `versionStyle: "full"` produces the `sec-ch-ua-full-version-list` /
 * `fullVersionList` variant; we report the version-reduced `<major>.0.0.0`
 * there because we have no real Chrome build number to offer, matching the
 * reduced form the UA string already uses.
 */
export function clientHintsBrandList(
	chromeVersion: string,
	versionStyle: "major" | "full",
): BrandVersion[] {
	const seed = chromeMajorVersion(chromeVersion);
	const suffix = versionStyle === "full" ? ".0.0.0" : "";
	const greaseChar = (offset: number) =>
		GREASE_CHARS[(seed + offset) % GREASE_CHARS.length];
	const chromeBrandVersion = `${seed}${suffix}`;
	const unshuffled: BrandVersion[] = [
		{
			brand: `Not${greaseChar(0)}A${greaseChar(1)}Brand`,
			version: `${GREASE_VERSIONS[seed % GREASE_VERSIONS.length]}${suffix}`,
		},
		{ brand: "Chromium", version: chromeBrandVersion },
		{ brand: "Google Chrome", version: chromeBrandVersion },
	];
	const order = BRAND_LIST_ORDERS[seed % BRAND_LIST_ORDERS.length];
	const shuffled: BrandVersion[] = [];
	unshuffled.forEach((entry, index) => {
		shuffled[order[index]] = entry;
	});
	return shuffled;
}

/** Structured-header list form used by the `sec-ch-ua*` request headers. */
export function formatBrandVersionList(brands: BrandVersion[]): string {
	return brands
		.map(({ brand, version }) => `"${brand}";v="${version}"`)
		.join(", ");
}

export function clientHintsPlatform(platform: string): string {
	switch (platform) {
		case "darwin":
			return "macOS";
		case "win32":
			return "Windows";
		default:
			return "Linux";
	}
}

function clientHintsPlatformVersion(
	platform: string,
	osVersion: string,
): string {
	// Chrome reports the real OS version on macOS and the kernel version on
	// Linux — both are what process.getSystemVersion() returns. Windows is the
	// exception: Client Hints carry an API-contract number ("13.0.0"+ means
	// Windows 11), not the "10.0.<build>" string the OS reports.
	if (platform !== "win32") return osVersion;
	const build = Number.parseInt(osVersion.split(".")[2] ?? "0", 10);
	return build >= 22000 ? "15.0.0" : "10.0.0";
}

export interface UserAgentDataOverride {
	brands: BrandVersion[];
	mobile: boolean;
	platform: string;
	highEntropy: {
		architecture: string;
		bitness: string;
		model: string;
		platform: string;
		platformVersion: string;
		uaFullVersion: string;
		fullVersionList: BrandVersion[];
	};
}

/** Everything the `navigator.userAgentData` replacement needs, as plain data. */
export function buildUserAgentDataOverride(input: {
	chromeVersion: string;
	platform: string;
	arch: string;
	osVersion: string;
}): UserAgentDataOverride {
	const platform = clientHintsPlatform(input.platform);
	return {
		brands: clientHintsBrandList(input.chromeVersion, "major"),
		mobile: false,
		platform,
		highEntropy: {
			architecture: input.arch === "arm64" ? "arm" : "x86",
			bitness: "64",
			model: "",
			platform,
			platformVersion: clientHintsPlatformVersion(
				input.platform,
				input.osVersion,
			),
			uaFullVersion: `${chromeMajorVersion(input.chromeVersion)}.0.0.0`,
			fullVersionList: clientHintsBrandList(input.chromeVersion, "full"),
		},
	};
}
