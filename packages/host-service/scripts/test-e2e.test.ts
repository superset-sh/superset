import { describe, expect, it } from "bun:test";
import path from "node:path";
import {
	findElectronBinary,
	getElectronBinaryCandidates,
	hasNativeModuleAbiMismatch,
} from "./test-e2e";

function fakeDirent(name: string, directory = true) {
	return {
		isDirectory: () => directory,
		name,
	};
}

describe("host-service test:e2e Electron resolver", () => {
	it("prefers the desktop Electron binary on Windows", () => {
		const repoRoot = String.raw`C:\repo`;
		const expected = path.join(
			repoRoot,
			"apps",
			"desktop",
			"node_modules",
			"electron",
			"dist",
			"electron.exe",
		);

		expect(
			findElectronBinary({
				existsSync: (candidate) => candidate === expected,
				platform: "win32",
				repoRoot,
				readdirSync: () => [],
			}),
		).toBe(expected);
	});

	it("finds Electron in Bun's flat store when workspace symlinks are absent", () => {
		const repoRoot = "/repo";
		const expected = path.join(
			repoRoot,
			"node_modules",
			".bun",
			"electron@40.8.5",
			"node_modules",
			"electron",
			"dist",
			"electron",
		);

		expect(
			findElectronBinary({
				existsSync: (candidate) => candidate === expected,
				platform: "linux",
				repoRoot,
				readdirSync: () => [
					fakeDirent("react@19.2.3"),
					fakeDirent("electron@40.8.5"),
					fakeDirent("electron-builder@26.8.1"),
				],
			}),
		).toBe(expected);
	});

	it("uses the macOS app binary suffix on darwin", () => {
		const candidates = getElectronBinaryCandidates({
			platform: "darwin",
			repoRoot: "/repo",
			readdirSync: () => [],
		});

		expect(candidates[0]).toBe(
			path.join(
				"/repo",
				"apps",
				"desktop",
				"node_modules",
				"electron",
				"dist",
				"Electron.app",
				"Contents",
				"MacOS",
				"Electron",
			),
		);
	});

	it("throws an actionable install message when Electron is missing", () => {
		expect(() =>
			findElectronBinary({
				existsSync: () => false,
				platform: "win32",
				repoRoot: String.raw`C:\repo`,
				readdirSync: () => [],
			}),
		).toThrow("Run `bun install` from the repo root first");
	});

	it("detects Electron native module ABI mismatch output", () => {
		expect(
			hasNativeModuleAbiMismatch(
				"was compiled against a different Node.js version using NODE_MODULE_VERSION 137\ncode: 'ERR_DLOPEN_FAILED'",
			),
		).toBe(true);
		expect(hasNativeModuleAbiMismatch("ordinary test failure")).toBe(false);
	});
});
