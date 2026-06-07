import { describe, expect, it } from "bun:test";
import {
	compileWidgetSource,
	hashSource,
	resolveWidgetFilePath,
} from "./workspace-card-widget-compile";

describe("compileWidgetSource", () => {
	it("strips TypeScript types and emits CJS exports", () => {
		const { code } = compileWidgetSource(
			"const x: number = 1;\nexport default function Widget() { return x; }",
		);
		// imports transform turns ESM export into a CJS assignment.
		expect(code).toContain("exports.default");
		// type annotation removed.
		expect(code).not.toContain(": number");
	});

	it("compiles JSX with the classic runtime (React.createElement)", () => {
		const { code } = compileWidgetSource(
			'import { tokens } from "superset/widgets";\n' +
				"export default function Widget() { return <div className={tokens.text.cardLine}>hi</div>; }",
		);
		expect(code).toContain("React.createElement");
		// import becomes a require call the renderer shim can intercept.
		expect(code).toContain("require('superset/widgets')");
	});

	it("rewrites react / react-icons imports to require", () => {
		const { code } = compileWidgetSource(
			'import * as React from "react";\n' +
				'import { LuGitBranch } from "react-icons/lu";\n' +
				"export default function Widget() { return <LuGitBranch />; }",
		);
		expect(code).toContain("require('react')");
		expect(code).toContain("require('react-icons/lu')");
	});

	it("produces a stable hash for identical source and differs on change", () => {
		const a = compileWidgetSource("export default function W(){return 1}");
		const b = compileWidgetSource("export default function W(){return 1}");
		const c = compileWidgetSource("export default function W(){return 2}");
		expect(a.hash).toBe(b.hash);
		expect(a.hash).not.toBe(c.hash);
	});

	it("throws on a syntax error so the caller can surface it", () => {
		expect(() => compileWidgetSource("export default function (")).toThrow();
	});
});

describe("hashSource", () => {
	it("is deterministic", () => {
		expect(hashSource("abc")).toBe(hashSource("abc"));
		expect(hashSource("abc")).not.toBe(hashSource("abd"));
	});
});

describe("resolveWidgetFilePath", () => {
	const repo = "/home/user/project";

	it("resolves a normal widgets/<name>.tsx path under .superset", () => {
		const resolved = resolveWidgetFilePath(repo, "widgets/ci.tsx");
		expect(resolved).toBe("/home/user/project/.superset/widgets/ci.tsx");
	});

	it("rejects .. traversal out of .superset", () => {
		expect(resolveWidgetFilePath(repo, "../../etc/passwd")).toBeNull();
		expect(resolveWidgetFilePath(repo, "widgets/../../../secret")).toBeNull();
	});

	it("rejects escaping even with an absolute-looking join", () => {
		// join collapses to outside .superset → blocked.
		expect(resolveWidgetFilePath(repo, "../config.json")).toBeNull();
	});

	it("allows a nested path inside .superset", () => {
		expect(resolveWidgetFilePath(repo, "widgets/sub/deep.tsx")).toBe(
			"/home/user/project/.superset/widgets/sub/deep.tsx",
		);
	});
});
