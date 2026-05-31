import { describe, expect, it } from "bun:test";
import {
	decodeProviderModelRef,
	encodeGatewayModelId,
	encodeProviderModelRef,
} from "./model-ref";

describe("provider model refs", () => {
	it("round-trips full Chat ids and gateway ids", () => {
		const ref = { providerId: "provider/a", modelId: "gpt-5.5(xhigh)" };

		expect(decodeProviderModelRef(encodeProviderModelRef(ref))).toEqual(ref);
		expect(decodeProviderModelRef(encodeGatewayModelId(ref))).toEqual(ref);
	});

	it("returns null for ordinary model ids", () => {
		expect(decodeProviderModelRef("claude-sonnet-4-5")).toBeNull();
	});
});
