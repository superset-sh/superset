import { describe, expect, it } from "bun:test";
import {
	buildUserAgentDataOverride,
	chromeMajorVersion,
	clientHintsBrandList,
	clientHintsPlatform,
	formatBrandVersionList,
} from "./client-hints";

function header(chromeVersion: string, style: "major" | "full" = "major") {
	return formatBrandVersionList(clientHintsBrandList(chromeVersion, style));
}

describe("clientHintsBrandList", () => {
	// Each expectation is the sec-ch-ua header real Chrome of that major
	// actually sent, covering different GREASE tokens and shuffle orders.
	it("matches real Chrome 120", () => {
		expect(header("120.0.6099.109")).toBe(
			'"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
		);
	});

	it("matches real Chrome 121", () => {
		expect(header("121.0.6167.85")).toBe(
			'"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
		);
	});

	it("matches real Chrome 122", () => {
		expect(header("122.0.6261.94")).toBe(
			'"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
		);
	});

	it("matches real Chrome 126", () => {
		expect(header("126.0.6478.127")).toBe(
			'"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
		);
	});

	it("produces the version-reduced full-version list", () => {
		expect(header("126.0.6478.127", "full")).toBe(
			'"Not/A)Brand";v="8.0.0.0", "Chromium";v="126.0.0.0", "Google Chrome";v="126.0.0.0"',
		);
	});
});

describe("clientHintsPlatform", () => {
	it("maps process.platform to Chrome's platform tokens", () => {
		expect(clientHintsPlatform("darwin")).toBe("macOS");
		expect(clientHintsPlatform("win32")).toBe("Windows");
		expect(clientHintsPlatform("linux")).toBe("Linux");
	});
});

describe("buildUserAgentDataOverride", () => {
	it("derives all values from the same Chromium version", () => {
		const override = buildUserAgentDataOverride({
			chromeVersion: "146.0.7302.99",
			platform: "darwin",
			arch: "arm64",
			osVersion: "15.3.1",
		});
		expect(chromeMajorVersion("146.0.7302.99")).toBe(146);
		expect(formatBrandVersionList(override.brands)).toBe(
			'"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
		);
		expect(override.mobile).toBe(false);
		expect(override.platform).toBe("macOS");
		expect(override.highEntropy).toEqual({
			architecture: "arm",
			bitness: "64",
			model: "",
			platform: "macOS",
			platformVersion: "15.3.1",
			uaFullVersion: "146.0.0.0",
			fullVersionList: [
				{ brand: "Chromium", version: "146.0.0.0" },
				{ brand: "Not-A.Brand", version: "24.0.0.0" },
				{ brand: "Google Chrome", version: "146.0.0.0" },
			],
		});
	});

	it("reports a Client Hints style platform version on Windows", () => {
		const win11 = buildUserAgentDataOverride({
			chromeVersion: "146.0.7302.99",
			platform: "win32",
			arch: "x64",
			osVersion: "10.0.26100",
		});
		expect(win11.highEntropy.platformVersion).toBe("15.0.0");
		expect(win11.highEntropy.architecture).toBe("x86");
	});
});
