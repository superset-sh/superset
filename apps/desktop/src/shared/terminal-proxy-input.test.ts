import { describe, expect, it } from "bun:test";
import {
	sanitizeTerminalProxyOverrideInput,
	sanitizeTerminalProxySettingsInput,
	terminalProxyOverrideInputSchema,
	terminalProxySettingsInputSchema,
} from "./terminal-proxy-input";

describe("terminal proxy input helpers", () => {
	it("sanitizes global manual settings and normalizes NO_PROXY", () => {
		const parsed = terminalProxySettingsInputSchema.parse({
			mode: "manual",
			manual: {
				proxyUrl: "http://proxy.example.com:8080",
				noProxy: " localhost, ,127.0.0.1 ",
			},
		});

		expect(sanitizeTerminalProxySettingsInput(parsed)).toEqual({
			mode: "manual",
			manual: {
				proxyUrl: "http://proxy.example.com:8080",
				noProxy: "localhost,127.0.0.1",
			},
		});
	});

	it("sanitizes project enabled override and strips manual when disabled", () => {
		const manualParsed = terminalProxyOverrideInputSchema.parse({
			mode: "enabled",
			manual: {
				proxyUrl: "http://proxy.example.com:8080",
			},
		});
		expect(sanitizeTerminalProxyOverrideInput(manualParsed)).toEqual({
			mode: "enabled",
			manual: {
				proxyUrl: "http://proxy.example.com:8080",
			},
		});

		const disabledParsed = terminalProxyOverrideInputSchema.parse({
			mode: "disabled",
		});
		expect(sanitizeTerminalProxyOverrideInput(disabledParsed)).toEqual({
			mode: "disabled",
		});
	});

	it("ignores stale manual payloads for non-manual global mode", () => {
		const parsed = terminalProxySettingsInputSchema.parse({
			mode: "auto",
			manual: {
				proxyUrl: "not-a-url",
			},
		});

		expect(sanitizeTerminalProxySettingsInput(parsed)).toEqual({
			mode: "auto",
		});
	});

	it("ignores stale manual payloads for non-enabled project mode", () => {
		const parsed = terminalProxyOverrideInputSchema.parse({
			mode: "inherit",
			manual: {
				proxyUrl: "not-a-url",
			},
		});

		expect(sanitizeTerminalProxyOverrideInput(parsed)).toEqual({
			mode: "inherit",
		});
	});

	it("rejects credentials in proxy URL at schema layer", () => {
		expect(() =>
			terminalProxySettingsInputSchema.parse({
				mode: "manual",
				manual: {
					proxyUrl: "http://user:pass@proxy.example.com:8080",
				},
			}),
		).toThrow(
			"Proxy URLs with embedded credentials are not allowed; use secure storage",
		);
	});
});
