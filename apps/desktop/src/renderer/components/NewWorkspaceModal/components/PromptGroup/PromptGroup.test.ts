import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";

// Regression guard for issue #4680: vertical scroll broken in the project
// selector dropdown.
//
// The PopoverContent is portaled to document.body via Radix, but React still
// bubbles synthetic events (including `wheel`) through the React tree. The
// NewWorkspaceModal wraps PromptGroup in `<div className="flex-1 overflow-y-auto">`
// (NewWorkspaceModalContent.tsx). Without `onWheel.stopPropagation()` on the
// popover, wheel scrolling inside the project list reaches that scrollable
// wrapper and the dropdown can't scroll past the first ~8 items.
//
// Every other picker in this file and in the dashboard variant uses the same
// `onWheel={(event) => event.stopPropagation()}` mitigation — see
// CompareBaseBranchPickerInline below in the same file, and
// routes/_authenticated/components/DashboardNewWorkspaceModal/.../ProjectPickerPill.tsx.
describe("ProjectPickerPill (PromptGroup)", () => {
	const source = readFileSync(join(import.meta.dir, "PromptGroup.tsx"), "utf8");

	// Return the JSX opening tag of <PopoverContent ...>, properly handling
	// `>` characters that appear inside JSX expression children (e.g. arrow
	// functions like `(event) => event.stopPropagation()`).
	const extractPopoverContentProps = (jsxSource: string) => {
		const start = jsxSource.indexOf("<PopoverContent");
		if (start === -1)
			throw new Error("PopoverContent JSX element not found in source");
		let braceDepth = 0;
		for (let i = start; i < jsxSource.length; i++) {
			const ch = jsxSource[i];
			if (ch === "{") braceDepth++;
			else if (ch === "}") braceDepth--;
			else if (ch === ">" && braceDepth === 0) {
				return jsxSource.slice(start, i + 1);
			}
		}
		throw new Error("Could not find end of <PopoverContent ...> opening tag");
	};

	const extractFunctionSource = (name: string) => {
		const marker = `function ${name}(`;
		const start = source.indexOf(marker);
		if (start === -1) throw new Error(`${name} not found in PromptGroup.tsx`);
		// Skip past the parameter list (which itself contains balanced braces for
		// destructured props) and find the body's opening brace.
		let parenDepth = 0;
		let paramsEnd = -1;
		for (let i = start + marker.length - 1; i < source.length; i++) {
			const ch = source[i];
			if (ch === "(") parenDepth++;
			else if (ch === ")") {
				parenDepth--;
				if (parenDepth === 0) {
					paramsEnd = i;
					break;
				}
			}
		}
		if (paramsEnd === -1)
			throw new Error(`Could not find end of ${name} parameter list`);
		const braceStart = source.indexOf("{", paramsEnd);
		let depth = 0;
		for (let i = braceStart; i < source.length; i++) {
			const ch = source[i];
			if (ch === "{") depth++;
			else if (ch === "}") {
				depth--;
				if (depth === 0) return source.slice(start, i + 1);
			}
		}
		throw new Error(`Could not find end of ${name} function`);
	};

	test("PopoverContent stops wheel propagation so the popup scrolls inside the modal", () => {
		const body = extractFunctionSource("ProjectPickerPill");

		expect(body).toContain("<PopoverContent");
		// PopoverContent must call stopPropagation on wheel events to keep them
		// from reaching the surrounding modal's overflow-y-auto wrapper.
		const popoverContentProps = extractPopoverContentProps(body);
		expect(popoverContentProps).toMatch(
			/onWheel=\{[\s\S]*?\.stopPropagation\(\)[\s\S]*?\}/,
		);
	});

	test("matches the pattern used by every other picker in this file", () => {
		// Sanity-check: the sibling picker in the same file already has the fix.
		// If it ever loses it, this regression class will resurface.
		const sibling = extractFunctionSource("CompareBaseBranchPickerInline");
		const siblingPopover = extractPopoverContentProps(sibling);
		expect(siblingPopover).toMatch(
			/onWheel=\{[\s\S]*?\.stopPropagation\(\)[\s\S]*?\}/,
		);
	});
});
