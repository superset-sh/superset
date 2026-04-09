import { describe, expect, it } from "bun:test";
import {
	buildProxyEnvVars,
	detectInheritedProxyFromEnv,
	getTerminalProxyStateLabel,
	maskProxyUrlCredentials,
	normalizeNoProxyCsv,
	resolveEffectiveTerminalProxyFromSettings,
	stripProxyEnvVars,
	validateTerminalProxyConfig,
} from "./terminal-proxy";

describe("terminal proxy utilities", () => {
	it("normalizes NO_PROXY CSV by trimming and removing empty tokens", () => {
		expect(normalizeNoProxyCsv(" localhost, ,127.0.0.1,, .internal ")).toBe(
			"localhost,127.0.0.1,.internal",
		);
	});

	it("masks URL credentials for UI output", () => {
		expect(
			maskProxyUrlCredentials("http://user:pass@proxy.example.com:8080"),
		).toBe("http://***:***@proxy.example.com:8080/");
	});

	it("masks malformed proxy credentials when URL parsing fails", () => {
		expect(maskProxyUrlCredentials("user:pass@proxy.example.com:8080")).toBe(
			"***:***@proxy.example.com:8080",
		);
		expect(maskProxyUrlCredentials("user@proxy.example.com:8080")).toBe(
			"***@proxy.example.com:8080",
		);
	});

	it("builds proxy env vars in upper and lower case", () => {
		expect(
			buildProxyEnvVars({
				proxyUrl: "http://proxy.example.com:8080",
				noProxy: "localhost,127.0.0.1",
			}),
		).toEqual({
			HTTP_PROXY: "http://proxy.example.com:8080",
			HTTPS_PROXY: "http://proxy.example.com:8080",
			http_proxy: "http://proxy.example.com:8080",
			https_proxy: "http://proxy.example.com:8080",
			NO_PROXY: "localhost,127.0.0.1",
			no_proxy: "localhost,127.0.0.1",
		});
	});

	it("strips all proxy env vars", () => {
		expect(
			stripProxyEnvVars({
				PATH: "/usr/bin",
				HTTP_PROXY: "http://proxy:8080",
				HTTPS_PROXY: "http://proxy:8080",
				NO_PROXY: "localhost",
				http_proxy: "http://proxy:8080",
				https_proxy: "http://proxy:8080",
				no_proxy: "localhost",
				ALL_PROXY: "socks5://proxy:1080",
			}),
		).toEqual({
			PATH: "/usr/bin",
		});
	});

	it("detects inherited proxy and ignores NO_PROXY-only env", () => {
		expect(
			detectInheritedProxyFromEnv({
				NO_PROXY: "localhost",
			}),
		).toEqual({
			noProxy: "localhost",
			hasProxy: false,
		});
	});

	it("preserves distinct HTTP/HTTPS inherited values", () => {
		expect(
			detectInheritedProxyFromEnv({
				HTTP_PROXY: "http://http-proxy:8080",
				HTTPS_PROXY: "http://https-proxy:8443",
				NO_PROXY: " localhost , .internal ",
			}),
		).toEqual({
			httpProxy: "http://http-proxy:8080",
			httpsProxy: "http://https-proxy:8443",
			proxyUrl: "http://https-proxy:8443",
			noProxy: " localhost , .internal ",
			hasProxy: true,
		});
	});

	it("falls back to lower-case inherited proxy keys when upper-case is blank", () => {
		expect(
			detectInheritedProxyFromEnv({
				HTTP_PROXY: "",
				http_proxy: "http://http-proxy-lower:8080",
				HTTPS_PROXY: "   ",
				https_proxy: "http://https-proxy-lower:8443",
				NO_PROXY: "",
				no_proxy: "localhost,.internal",
			}),
		).toEqual({
			httpProxy: "http://http-proxy-lower:8080",
			httpsProxy: "http://https-proxy-lower:8443",
			proxyUrl: "http://https-proxy-lower:8443",
			noProxy: "localhost,.internal",
			hasProxy: true,
		});
	});

	it("rejects invalid manual proxy URL during validation", () => {
		expect(() =>
			validateTerminalProxyConfig({
				proxyUrl: "not-a-url",
			}),
		).toThrow("Proxy URL must be a valid http(s)/socks URL");
	});

	it("rejects manual proxy URLs with embedded credentials", () => {
		expect(() =>
			validateTerminalProxyConfig({
				proxyUrl: "http://user:pass@proxy.example.com:8080",
			}),
		).toThrow(
			"Proxy URLs with embedded credentials are not allowed; use secure storage",
		);
	});

	it("allows embedded credentials when explicitly validating inherited config", () => {
		expect(
			validateTerminalProxyConfig(
				{
					proxyUrl: "http://user:pass@proxy.example.com:8080",
				},
				{ allowCredentials: true },
			),
		).toEqual({
			proxyUrl: "http://user:pass@proxy.example.com:8080",
		});
	});

	it("builds proxy env vars for authenticated inherited proxy URLs", () => {
		expect(
			buildProxyEnvVars({
				proxyUrl: "http://user:pass@proxy.example.com:8080",
			}),
		).toEqual({
			HTTP_PROXY: "http://user:pass@proxy.example.com:8080",
			HTTPS_PROXY: "http://user:pass@proxy.example.com:8080",
			http_proxy: "http://user:pass@proxy.example.com:8080",
			https_proxy: "http://user:pass@proxy.example.com:8080",
		});
	});
});

describe("resolveEffectiveTerminalProxyFromSettings", () => {
	const inherited = detectInheritedProxyFromEnv({
		HTTP_PROXY: "http://inherited-proxy:8080",
		NO_PROXY: "localhost",
	});

	it("project disabled always wins", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "disabled" },
				globalSettings: {
					mode: "manual",
					manual: { proxyUrl: "http://g:8080" },
				},
				inheritedProxy: inherited,
			}),
		).toEqual({
			state: "disabled",
			source: "project",
		});
	});

	it("project disabled ignores inherited proxy even when global is auto", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "disabled" },
				globalSettings: { mode: "auto" },
				inheritedProxy: inherited,
			}),
		).toEqual({
			state: "disabled",
			source: "project",
		});
	});

	it("project enabled manual wins over global", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: {
					mode: "enabled",
					manual: {
						proxyUrl: "http://project-proxy:8080",
						noProxy: "localhost",
					},
				},
				globalSettings: { mode: "auto" },
				inheritedProxy: inherited,
			}),
		).toEqual({
			state: "manual",
			source: "project",
			config: { proxyUrl: "http://project-proxy:8080", noProxy: "localhost" },
		});
	});

	it("project enabled applies manual even when global has no proxy", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: {
					mode: "enabled",
					manual: {
						proxyUrl: "http://project-proxy:8080",
					},
				},
				globalSettings: { mode: "auto" },
				inheritedProxy: { hasProxy: false },
			}),
		).toEqual({
			state: "manual",
			source: "project",
			config: { proxyUrl: "http://project-proxy:8080" },
		});
	});

	it("inherit + global disabled resolves to disabled", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "inherit" },
				globalSettings: { mode: "disabled" },
				inheritedProxy: inherited,
			}),
		).toEqual({
			state: "disabled",
			source: "global-disabled",
		});
	});

	it("inherit + global manual uses global manual", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "inherit" },
				globalSettings: {
					mode: "manual",
					manual: {
						proxyUrl: "http://global-proxy:8080",
						noProxy: "localhost",
					},
				},
				inheritedProxy: inherited,
			}),
		).toEqual({
			state: "manual",
			source: "global-manual",
			config: { proxyUrl: "http://global-proxy:8080", noProxy: "localhost" },
		});
	});

	it("inherit + global manual ignores inherited proxy values", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "inherit" },
				globalSettings: {
					mode: "manual",
					manual: { proxyUrl: "http://global-proxy:8080" },
				},
				inheritedProxy: {
					hasProxy: true,
					proxyUrl: "http://inherited-proxy:8080",
					noProxy: "localhost",
				},
			}),
		).toEqual({
			state: "manual",
			source: "global-manual",
			config: { proxyUrl: "http://global-proxy:8080" },
		});
	});

	it("inherit + global auto uses inherited when present", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "inherit" },
				globalSettings: { mode: "auto" },
				inheritedProxy: inherited,
			}),
		).toEqual({
			state: "manual",
			source: "global-auto",
			config: { proxyUrl: "http://inherited-proxy:8080", noProxy: "localhost" },
			httpProxy: "http://inherited-proxy:8080",
		});
	});

	it("inherit + global auto falls back to httpProxy without proxyUrl", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "inherit" },
				globalSettings: { mode: "auto" },
				inheritedProxy: {
					hasProxy: true,
					httpProxy: "http://inherited-http-proxy:8080",
				},
			}),
		).toEqual({
			state: "manual",
			source: "global-auto",
			config: { proxyUrl: "http://inherited-http-proxy:8080" },
			httpProxy: "http://inherited-http-proxy:8080",
		});
	});

	it("inherit + global auto keeps inherited authenticated proxy URLs", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "inherit" },
				globalSettings: { mode: "auto" },
				inheritedProxy: {
					hasProxy: true,
					proxyUrl: "http://user:pass@inherited-proxy:8080",
				},
			}),
		).toEqual({
			state: "manual",
			source: "global-auto",
			config: { proxyUrl: "http://user:pass@inherited-proxy:8080" },
			httpProxy: "http://user:pass@inherited-proxy:8080",
			httpsProxy: "http://user:pass@inherited-proxy:8080",
		});
	});

	it("inherit + global auto accepts valid HTTP_PROXY when HTTPS_PROXY is invalid", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "inherit" },
				globalSettings: { mode: "auto" },
				inheritedProxy: {
					hasProxy: true,
					httpProxy: "http://inherited-http-proxy:8080",
					httpsProxy: "bad-url",
					noProxy: " localhost , .internal ",
				},
			}),
		).toEqual({
			state: "manual",
			source: "global-auto",
			config: {
				proxyUrl: "http://inherited-http-proxy:8080",
				noProxy: "localhost,.internal",
			},
			httpProxy: "http://inherited-http-proxy:8080",
		});
	});

	it("inherit + global auto without inherited proxy resolves to none", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "inherit" },
				globalSettings: { mode: "auto" },
				inheritedProxy: { hasProxy: false },
			}),
		).toEqual({
			state: "none",
			source: "none",
		});
	});

	it("inherit + global auto resolves to none when both HTTP_PROXY and HTTPS_PROXY are invalid", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "inherit" },
				globalSettings: { mode: "auto" },
				inheritedProxy: {
					hasProxy: true,
					httpProxy: "not-a-url",
					httpsProxy: "also-bad",
				},
			}),
		).toEqual({
			state: "none",
			source: "none",
		});
	});

	it("invalid project manual proxy resolves to none", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: {
					mode: "enabled",
					manual: { proxyUrl: "not-a-url" },
				},
				globalSettings: {
					mode: "manual",
					manual: { proxyUrl: "http://g:8080" },
				},
				inheritedProxy: inherited,
			}),
		).toEqual({
			state: "none",
			source: "none",
		});
	});

	it("invalid global manual proxy resolves to none", () => {
		expect(
			resolveEffectiveTerminalProxyFromSettings({
				projectOverride: { mode: "inherit" },
				globalSettings: { mode: "manual", manual: { proxyUrl: "bad-url" } },
				inheritedProxy: inherited,
			}),
		).toEqual({
			state: "none",
			source: "none",
		});
	});
});

describe("getTerminalProxyStateLabel", () => {
	it("returns explicit label for inherit + global disabled", () => {
		expect(
			getTerminalProxyStateLabel({
				projectMode: "inherit",
				globalMode: "disabled",
				effective: {
					state: "disabled",
					source: "global-disabled",
				},
			}),
		).toBe("Proxy disabled (global setting)");
	});
});
