import { expect, test } from "bun:test";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import { renderToStaticMarkup } from "react-dom/server";
import {
	LOCAL_PATH_PREFIX,
	remarkLocalPathLinks,
} from "./remarkLocalPathLinks";

function hrefs(markdown: string): string[] {
	const html = renderToStaticMarkup(
		<ChatMarkdown remarkPlugins={[remarkLocalPathLinks]}>
			{markdown}
		</ChatMarkdown>,
	);
	return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

test("relative and absolute file links survive the markdown hardening", () => {
	expect(
		hrefs(
			"[a](src/app.ts:12) [b](/Users/me/x.ts#L3) [c](.git/) [d](package.json:4) [e](file:///tmp/a.ts)",
		).map((href) => decodeURIComponent(href.slice(LOCAL_PATH_PREFIX.length))),
	).toEqual([
		"src/app.ts:12",
		"/Users/me/x.ts#L3",
		".git/",
		"package.json:4",
		"file:///tmp/a.ts",
	]);
});

test("web links are left as they are", () => {
	expect(hrefs("[site](https://example.com/a) [mail](mailto:a@b.co)")).toEqual([
		"https://example.com/a",
		"mailto:a@b.co",
	]);
});

test("links with other schemes stay blocked", () => {
	expect(hrefs("[v](vscode://file/x.ts) [s](slack://open)")).toEqual([]);
});
