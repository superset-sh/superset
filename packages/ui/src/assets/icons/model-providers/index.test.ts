import { describe, expect, it } from "bun:test";

import {
	getLocalLobeModelProviderIcon,
	getLocalModelSelectorLogo,
} from "./index";

describe("local model provider icons", () => {
	it("resolves model-family icons from bundled local assets", () => {
		const openai = getLocalLobeModelProviderIcon({
			id: "openai",
			variant: "mono",
		});
		const claude = getLocalLobeModelProviderIcon({
			id: "claude",
			variant: "color",
		});

		expect(openai?.src).toBeTruthy();
		expect(openai?.src).not.toStartWith("http");
		expect(openai?.variant).toBe("mono");
		expect(claude?.src).toBeTruthy();
		expect(claude?.src).not.toStartWith("http");
		expect(claude?.variant).toBe("color");
	});

	it("resolves model selector provider logos from bundled local assets", () => {
		expect(getLocalModelSelectorLogo("openai")).toBeTruthy();
		expect(getLocalModelSelectorLogo("openai")).not.toStartWith("http");
		expect(getLocalModelSelectorLogo("anthropic")).toBeTruthy();
		expect(getLocalModelSelectorLogo("anthropic")).not.toStartWith("http");
		expect(getLocalModelSelectorLogo("unknown-provider")).toBeNull();
	});
});
