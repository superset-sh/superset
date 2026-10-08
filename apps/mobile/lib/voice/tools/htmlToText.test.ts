import { describe, expect, test } from "bun:test";
import { htmlToText } from "./htmlToText";

describe("htmlToText", () => {
	test("keeps the words and drops scripts, styles and tags", () => {
		const html =
			"<html><head><style>p{color:red}</style><script>alert(1)</script></head>" +
			"<body><h1>Usage &amp; cost</h1><p>Up <b>12%</b> this week.</p><ul><li>API</li><li>Web</li></ul></body></html>";
		expect(htmlToText(html)).toBe("Usage & cost\nUp 12% this week.\nAPI\nWeb");
	});
});
