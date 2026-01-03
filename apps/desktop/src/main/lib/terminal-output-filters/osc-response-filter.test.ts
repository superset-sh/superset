import { describe, expect, it } from "bun:test";
import { oscResponseFilter } from "./osc-response-filter";

const ESC = "\x1b";
const BEL = "\x07";

describe("oscResponseFilter", () => {
	describe("OSC color responses", () => {
		it("should filter OSC 11 background color response with BEL terminator", () => {
			const response = `${ESC}]11;rgb:1a1a/1a1a/1a1a${BEL}`;
			expect(oscResponseFilter.filter(response)).toBe("");
		});

		it("should filter OSC 11 background color response with ST terminator", () => {
			const response = `${ESC}]11;rgb:1a1a/1a1a/1a1a${ESC}\\`;
			expect(oscResponseFilter.filter(response)).toBe("");
		});

		it("should filter OSC 10 foreground color response", () => {
			const response = `${ESC}]10;rgb:ffff/ffff/ffff${BEL}`;
			expect(oscResponseFilter.filter(response)).toBe("");
		});

		it("should filter OSC 12 cursor color response", () => {
			const response = `${ESC}]12;rgb:0000/ffff/0000${BEL}`;
			expect(oscResponseFilter.filter(response)).toBe("");
		});

		it("should filter partial OSC response without ESC prefix", () => {
			const response = "11;rgb:1a1a/1a1a/1a1a";
			expect(oscResponseFilter.filter(response)).toBe("");
		});

		it("should filter partial OSC response with trailing 1R", () => {
			const response = "11;rgb:1a1a/1a1a/1a1a1R";
			expect(oscResponseFilter.filter(response)).toBe("");
		});

		it("should preserve normal text around OSC response", () => {
			const data = `before${ESC}]11;rgb:1a1a/1a1a/1a1a${BEL}after`;
			expect(oscResponseFilter.filter(data)).toBe("beforeafter");
		});
	});

	describe("Device Attributes responses", () => {
		it("should filter DA1 response", () => {
			const response = `${ESC}[?1;2c`;
			expect(oscResponseFilter.filter(response)).toBe("");
		});

		it("should filter DA2 response with more params", () => {
			const response = `${ESC}[?65;1;9c`;
			expect(oscResponseFilter.filter(response)).toBe("");
		});
	});

	describe("Cursor Position Report", () => {
		it("should filter CPR response", () => {
			const response = `${ESC}[24;80R`;
			expect(oscResponseFilter.filter(response)).toBe("");
		});

		it("should filter CPR with different positions", () => {
			const response = `${ESC}[1;1R`;
			expect(oscResponseFilter.filter(response)).toBe("");
		});
	});

	describe("mixed content", () => {
		it("should filter multiple response types", () => {
			const data = `text${ESC}]11;rgb:1a1a/1a1a/1a1a${BEL}more${ESC}[?1;2c${ESC}[24;80Rend`;
			expect(oscResponseFilter.filter(data)).toBe("textmoreend");
		});

		it("should preserve ANSI color codes", () => {
			const data = `${ESC}[32mgreen text${ESC}[0m`;
			expect(oscResponseFilter.filter(data)).toBe(data);
		});

		it("should preserve normal escape sequences", () => {
			const data = `${ESC}[H${ESC}[2J`;
			expect(oscResponseFilter.filter(data)).toBe(data);
		});
	});
});
