import { describe, expect, it } from "bun:test";
import { pageContentSecurityPolicy } from "./csp";

describe("pageContentSecurityPolicy", () => {
	it("allows the Google Fonts stylesheet host, and nothing else, in style-src", () => {
		const policy = pageContentSecurityPolicy(["'none'"]);
		const styleSrc = policy
			.split("; ")
			.find((directive) => directive.startsWith("style-src"));
		expect(styleSrc).toBe(
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		);
	});

	it("keeps script-src closed to remote hosts", () => {
		const policy = pageContentSecurityPolicy(["'none'"]);
		const scriptSrc = policy
			.split("; ")
			.find((directive) => directive.startsWith("script-src"));
		expect(scriptSrc).toBe("script-src 'self' 'unsafe-inline'");
	});

	it("already allows any https font file", () => {
		const policy = pageContentSecurityPolicy(["'none'"]);
		expect(policy).toContain("font-src 'self' data: https:");
	});

	it("joins the given frame-ancestors", () => {
		const policy = pageContentSecurityPolicy([
			"https://a.example",
			"https://b.example",
		]);
		expect(policy).toContain(
			"frame-ancestors https://a.example https://b.example",
		);
	});
});

describe("pageContentSecurityPolicy connect-src", () => {
	it("admits the realtime origin over both ws and https", () => {
		const policy = pageContentSecurityPolicy(
			["'none'"],
			"https://realtime.example",
		);
		const connectSrc = policy
			.split("; ")
			.find((directive) => directive.startsWith("connect-src"));
		expect(connectSrc).toBe(
			"connect-src wss://realtime.example https://realtime.example",
		);
	});

	it("stays closed when no realtime origin is configured", () => {
		const policy = pageContentSecurityPolicy(["'none'"]);
		const connectSrc = policy
			.split("; ")
			.find((directive) => directive.startsWith("connect-src"));
		expect(connectSrc).toBe("connect-src 'none'");
	});

	it("admits no other host", () => {
		const policy = pageContentSecurityPolicy(
			["'none'"],
			"https://realtime.example",
		);
		expect(policy).not.toContain("connect-src 'self'");
		expect(policy).not.toContain("*");
	});
});
