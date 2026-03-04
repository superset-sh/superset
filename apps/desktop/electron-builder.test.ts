import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const buildDir = join(import.meta.dir, "src/resources/build");

describe("macOS build configuration for Codex voice transcription", () => {
	describe("entitlements.mac.plist", () => {
		const content = readFileSync(
			join(buildDir, "entitlements.mac.plist"),
			"utf-8",
		);

		it("should include audio-input entitlement so macOS grants microphone access", () => {
			// Without com.apple.security.device.audio-input, macOS TCC denies
			// microphone access and Codex voice transcription fails with
			// "empty transcription result". See issue #1805.
			expect(content).toContain("com.apple.security.device.audio-input");
		});
	});

	describe("entitlements.mac.inherit.plist", () => {
		const content = readFileSync(
			join(buildDir, "entitlements.mac.inherit.plist"),
			"utf-8",
		);

		it("should include audio-input entitlement so child processes inherit microphone access", () => {
			expect(content).toContain("com.apple.security.device.audio-input");
		});
	});

	describe("electron-builder.ts", () => {
		const content = readFileSync(
			join(import.meta.dir, "electron-builder.ts"),
			"utf-8",
		);

		it("should include NSMicrophoneUsageDescription in extendInfo", () => {
			// macOS requires a usage description string in Info.plist to prompt
			// the user for microphone permission via TCC.
			expect(content).toContain("NSMicrophoneUsageDescription");
		});
	});
});
