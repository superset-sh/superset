import { afterEach, describe, expect, test } from "bun:test";
import {
	ArchSource,
	detectPlatform,
	isMacPlatform,
	normalizeArch,
	Platform,
} from "./useOS";

const MAC_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

interface StubOptions {
	userAgent?: string;
	/** Omit to stub a browser with no userAgentData (Safari, Firefox). */
	architecture?: string;
	hasUserAgentData?: boolean;
	rejects?: boolean;
}

function stubNavigator({
	userAgent = MAC_UA,
	architecture,
	hasUserAgentData = true,
	rejects = false,
}: StubOptions) {
	const nav: Record<string, unknown> = { userAgent };
	if (hasUserAgentData) {
		nav.userAgentData = {
			getHighEntropyValues: async () => {
				if (rejects) throw new Error("blocked by the browser");
				return { architecture };
			},
		};
	}
	globalThis.navigator = nav as unknown as Navigator;
}

const resolve = (options: StubOptions) => {
	stubNavigator(options);
	return detectPlatform();
};

const REAL_NAVIGATOR = globalThis.navigator;

afterEach(() => {
	globalThis.navigator = REAL_NAVIGATOR;
});

describe("normalizeArch", () => {
	test.each([
		["arm", "arm"],
		["x86", "x86"],
		["ARM", "arm"],
		[" x86 ", "x86"],
		["arm64", "arm"],
		["x86_64", "x86"],
		["amd64", "x86"],
		["", null],
		[null, null],
		[undefined, null],
		["unknown", null],
		["wasm", null],
	])("normalises %p to %p", (value, expected) => {
		expect(normalizeArch(value as string | null)).toBe(
			expected as "arm" | "x86" | null,
		);
	});
});

describe("Mac architecture detection", () => {
	test("uses the client hint when the browser exposes one", async () => {
		expect(await resolve({ architecture: "arm" })).toEqual({
			platform: Platform.MacAppleSilicon,
			archSource: ArchSource.ClientHint,
		});
		expect(await resolve({ architecture: "x86" })).toEqual({
			platform: Platform.MacIntel,
			archSource: ArchSource.ClientHint,
		});
	});

	// A real Intel Mac must never fall through to the Apple Silicon default
	// just because its engine spelled the architecture differently.
	test.each([
		["x86_64", Platform.MacIntel],
		["amd64", Platform.MacIntel],
		["arm64", Platform.MacAppleSilicon],
	])("normalises a %p client hint", async (architecture, expected) => {
		const result = await resolve({ architecture });
		expect(result.platform).toBe(expected);
		expect(result.archSource).toBe(ArchSource.ClientHint);
	});

	// The regression from issue #7036: an Apple Silicon Mac was handed the x64
	// build because the browser exposed no usable architecture and the old
	// WebGL heuristic read "not an Apple GPU" as proof of Intel. Nothing may
	// resolve to Intel unless a browser actually said so.
	test.each([
		[
			"the browser has no userAgentData (Safari, Firefox)",
			{ hasUserAgentData: false },
		],
		[
			"userAgentData is present but architecture is empty",
			{ architecture: "" },
		],
		["getHighEntropyValues rejects", { rejects: true }],
		["architecture is an unrecognised value", { architecture: "wasm" }],
	])("defaults to Apple Silicon when %s", async (_label, options) => {
		expect(await resolve(options)).toEqual({
			platform: Platform.MacAppleSilicon,
			archSource: ArchSource.Default,
		});
	});
});

describe("operating system detection", () => {
	test.each([
		[
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			Platform.Windows,
		],
		["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36", Platform.Linux],
		[
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
			Platform.Mobile,
		],
		["something else entirely", Platform.Unknown],
	])("classifies %p", async (userAgent, expected) => {
		const result = await resolve({ userAgent, hasUserAgentData: false });
		expect(result.platform).toBe(expected);
		expect(result.archSource).toBe(ArchSource.NotMac);
	});

	test("an iPad reporting Mac OS X is treated as mobile, not a Mac", async () => {
		const result = await resolve({
			userAgent:
				"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
		});
		expect(result.platform).toBe(Platform.Mobile);
	});
});

describe("isMacPlatform", () => {
	test.each([
		[Platform.MacAppleSilicon, true],
		[Platform.MacIntel, true],
		[Platform.Windows, false],
		[Platform.Linux, false],
		[Platform.Mobile, false],
		[Platform.Unknown, false],
	])("%p is a Mac: %p", (platform, expected) => {
		expect(isMacPlatform(platform)).toBe(expected);
	});
});
