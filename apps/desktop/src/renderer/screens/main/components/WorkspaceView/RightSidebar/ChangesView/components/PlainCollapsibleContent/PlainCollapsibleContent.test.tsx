import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlainCollapsibleContent } from "./PlainCollapsibleContent";

describe("PlainCollapsibleContent", () => {
	test("renders children and drops the hidden attribute when open", () => {
		const html = renderToStaticMarkup(
			<PlainCollapsibleContent id="row-1" isOpen>
				<span>file.ts</span>
			</PlainCollapsibleContent>,
		);

		expect(html).toContain('id="row-1"');
		expect(html).toContain('data-state="open"');
		expect(html).not.toContain("hidden");
		expect(html).toContain("file.ts");
	});

	test("sets the hidden attribute and omits children when closed", () => {
		const html = renderToStaticMarkup(
			<PlainCollapsibleContent id="row-1" isOpen={false}>
				<span>file.ts</span>
			</PlainCollapsibleContent>,
		);

		expect(html).toContain("hidden=");
		expect(html).toContain('data-state="closed"');
		expect(html).not.toContain("file.ts");
	});
});
