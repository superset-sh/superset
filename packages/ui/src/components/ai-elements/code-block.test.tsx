import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeBlock } from "./code-block";

describe("CodeBlock", () => {
	it("applies whitespace-pre class to preserve code block whitespace", () => {
		const codeWithWhitespace = `Line 1      has    multiple   spaces
  Line 2 is indented with 2 spaces
    Line 3 is indented with 4 spaces`;

		const html = renderToStaticMarkup(
			<CodeBlock
				code={codeWithWhitespace}
				language="text"
				showLineNumbers={false}
			/>,
		);

		// Verify the whitespace-pre class is applied to both light and dark mode pre elements
		// This CSS class ensures white-space: pre is applied, preventing whitespace collapse
		// In HTML, [&>pre] gets escaped to [&amp;&gt;pre]
		expect(html).toContain("[&amp;&gt;pre]:whitespace-pre");

		// Verify it appears for both themes
		const whitespacePreCount = (html.match(/whitespace-pre/g) || []).length;
		expect(whitespacePreCount).toBeGreaterThanOrEqual(2); // once for light, once for dark
	});

	it("applies whitespace-pre class for ASCII diagrams", () => {
		const asciiDiagram = `┌─────────┐       ┌─────────┐
│  Box 1  │  →    │  Box 2  │
└─────────┘       └─────────┘`;

		const html = renderToStaticMarkup(
			<CodeBlock code={asciiDiagram} language="text" showLineNumbers={false} />,
		);

		// Verify whitespace-pre class is present for proper alignment
		expect(html).toContain("[&amp;&gt;pre]:whitespace-pre");
	});

	it("applies whitespace-pre class for code with syntax highlighting", () => {
		const jsCode = `function test() {
    const x    =     1;  // multiple spaces
      const y  = 2;      // extra indent
}`;

		const html = renderToStaticMarkup(
			<CodeBlock code={jsCode} language="javascript" showLineNumbers={true} />,
		);

		// Verify whitespace-pre is applied even with language-specific highlighting
		expect(html).toContain("[&amp;&gt;pre]:whitespace-pre");
	});
});
