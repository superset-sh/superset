import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { Lang, parse } from "@ast-grep/napi";
import { ENFORCED_DIRS } from "./enforced-dirs";

// Ratchet: directories in ENFORCED_DIRS must not render hardcoded JSX text.
// Words inside <Trans> are fine — that's Lingui's own element. The check
// also covers visible string props. Brands, literal command examples and
// technical identifiers are deliberately excluded from translation.

const REPO_ROOT = resolve(import.meta.dir, "../../..");

// At least two consecutive letters = a word a user could read. Skips
// separators ("•", "/"), numbers, and single-letter artifacts.
const WORD = /[A-Za-z]{2,}/;

// Lingui macro elements whose children/branches are catalog messages.
const LINGUI_ELEMENTS = ["<Trans", "<Plural", "<Select", "<SelectOrdinal"];

function isInsideTrans(node: import("@ast-grep/napi").SgNode): boolean {
	let current = node.parent();
	while (current) {
		const kind = current.kind();
		if (
			kind === "jsx_element" &&
			LINGUI_ELEMENTS.some((tag) => current?.child(0)?.text().startsWith(tag))
		) {
			return true;
		}
		// Self-closing macro usage holds its branches in JSX props, e.g.
		// <Plural one={<>…</>} other={<>…</>} />.
		if (
			kind === "jsx_self_closing_element" &&
			LINGUI_ELEMENTS.some((tag) => current?.text().startsWith(tag))
		) {
			return true;
		}
		current = current.parent();
	}
	return false;
}

const LITERAL_IDENTIFIERS = new Set([
	"Superset",
	"Claude",
	"Cursor",
	"Linear",
	"Link",
	"Bash",
	"desktop",
	"cloud",
	"gpu-box",
	"mobile",
	"cli",
	"you@company.com",
	"you@example.com",
	"acme-inc",
	"my-project",
	"yourhandle",
	"about:blank",
	"work",
	"CLIENT_KEY...",
]);
const VISIBLE_PROP =
	/^(title|label|placeholder|aria-label|accessibilityLabel|description|alt|emptyMessage|message)=["']([\s\S]*)["']$/;

async function findHardcodedText(dir: string): Promise<string[]> {
	const offenders: string[] = [];
	const glob = new Bun.Glob("**/*.tsx");
	for await (const file of glob.scan({ cwd: join(REPO_ROOT, dir) })) {
		if (file.includes(".test.") || file.includes(".stories.")) continue;
		const path = join(REPO_ROOT, dir, file);
		const source = await Bun.file(path).text();
		const root = parse(Lang.Tsx, source).root();
		for (const node of root.findAll({ rule: { kind: "jsx_attribute" } })) {
			const match = node.text().match(VISIBLE_PROP);
			const value = match?.[2];
			if (
				!value ||
				!WORD.test(value) ||
				LITERAL_IDENTIFIERS.has(value) ||
				/^(https?:|\.\/|--|FREQ=|bun |docker |claude |:)/.test(value) ||
				isInsideTrans(node)
			)
				continue;
			offenders.push(
				`${dir}/${file}:${node.range().start.line + 1} ${node.text()}`,
			);
		}
		for (const node of root.findAll({ rule: { kind: "call_expression" } })) {
			const callee = node.field("function")?.text();
			if (
				!callee ||
				!/^(toast\.(success|error|warning|info|loading)|Alert\.alert)$/.test(
					callee,
				)
			)
				continue;
			for (const argument of node.field("arguments")?.children() ?? []) {
				if (argument.kind() !== "string" || !WORD.test(argument.text()))
					continue;
				offenders.push(
					`${dir}/${file}:${argument.range().start.line + 1} ${callee}(${argument.text()})`,
				);
			}
		}
		for (const node of root.findAll({ rule: { kind: "jsx_text" } })) {
			const text = node.text().trim();
			if (!WORD.test(text)) continue;
			if (isInsideTrans(node)) continue;
			const line = node.range().start.line + 1;
			offenders.push(`${dir}/${file}:${line} ${JSON.stringify(text)}`);
		}
	}
	return offenders;
}

describe("i18n hardcoded-string ratchet", () => {
	for (const dir of ENFORCED_DIRS) {
		test(`${dir} has no hardcoded JSX text`, async () => {
			const offenders = await findHardcodedText(dir);
			expect(
				offenders,
				`Hardcoded JSX text in an i18n-enforced directory. Wrap it in <Trans>, or use useLingui()'s t(). Offenders:\n${offenders.join("\n")}`,
			).toEqual([]);
		});
	}
});
