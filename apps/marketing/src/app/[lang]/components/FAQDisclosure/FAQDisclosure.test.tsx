import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PRICING_FAQ_ITEMS } from "../../pricing/constants";
import { FAQ_ITEMS, faqSourceText } from "../FAQSection/constants";
import { FAQDisclosure } from "./FAQDisclosure";

describe("FAQ disclosure server content", () => {
	for (const [name, items] of [
		["home-faq", FAQ_ITEMS],
		["pricing-faq", PRICING_FAQ_ITEMS],
	] as const) {
		test(`${name} retains every answer before interaction`, () => {
			const html = renderToStaticMarkup(
				items.map((item) => (
					<FAQDisclosure
						key={item.id}
						name={name}
						question={faqSourceText(item.question)}
					>
						<p>{faqSourceText(item.answer)}</p>
					</FAQDisclosure>
				)),
			);
			expect(html.match(/<details\b/g)).toHaveLength(items.length);
			expect(html).not.toMatch(/<details[^>]*\sopen(?:[\s=>])/);
			for (const item of items) {
				expect(html).toContain(
					renderToStaticMarkup(<p>{faqSourceText(item.answer)}</p>),
				);
			}
		});
	}
});
