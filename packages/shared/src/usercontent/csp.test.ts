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
