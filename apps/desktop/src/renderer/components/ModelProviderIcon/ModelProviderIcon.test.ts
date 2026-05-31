import { describe, expect, it } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source regression test reads the local component file
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source regression test reads the local component file
import { join } from "node:path";
import { resolveModelProviderIconId } from "./ModelProviderIcon";

describe("resolveModelProviderIconId", () => {
	it("does not depend on remote LobeHub icon URLs", () => {
		const source = readFileSync(
			join(import.meta.dir, "ModelProviderIcon.tsx"),
			"utf8",
		);

		expect(source).not.toContain("unpkg.com");
		expect(source).not.toContain("https://");
		expect(source).toContain("getLocalLobeModelProviderIcon");
	});

	it("infers well-known providers from model ids before generic provider names", () => {
		expect(
			resolveModelProviderIconId({
				provider: "E2E Gateway Provider",
				modelId: "gpt-e2e-chat",
				protocol: "openai-chat",
			}),
		).toEqual({ id: "openai", variant: "mono" });

		expect(
			resolveModelProviderIconId({
				provider: "Custom Anthropic-compatible",
				modelId: "claude-e2e-sonnet",
				protocol: "anthropic",
			}),
		).toEqual({ id: "claude", variant: "color" });
	});

	it("falls back to protocol when provider and model names are custom", () => {
		expect(
			resolveModelProviderIconId({
				provider: "Private Gateway",
				modelId: "private-fast",
				protocol: "openai-responses",
			}),
		).toEqual({ id: "openai", variant: "mono" });

		expect(
			resolveModelProviderIconId({
				provider: "Private Gateway",
				modelId: "private-fast",
				protocol: null,
			}),
		).toBeNull();
	});
});
