import { beforeAll, describe, expect, it } from "bun:test";
import {
	PreserveSoftbreakSpaces,
	preserveSoftbreakSpacesInDOM,
	softbreakNewlineToSpace,
} from "./preserveSoftbreakSpaces";

beforeAll(() => {
	globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 } as typeof Node;
});

type TestNode = TestElement | TestText;

class TestText {
	readonly nodeType = 3;
	textContent: string;
	nextSibling: TestNode | null = null;

	constructor(text: string) {
		this.textContent = text;
	}
}

class TestElement {
	readonly nodeType = 1;
	nextSibling: TestNode | null = null;
	parentElement: TestElement | null = null;
	childNodes: TestNode[] = [];

	constructor(readonly tagName: string) {}

	closest(selector: string): TestElement | null {
		const tag = selector.toUpperCase();
		let current: TestElement | null = this;
		while (current) {
			if (current.tagName === tag) {
				return current;
			}
			current = current.parentElement;
		}
		return null;
	}

	querySelectorAll(selector: string): TestElement[] {
		if (selector !== "*") {
			throw new Error(`test DOM only supports "*" (got ${selector})`);
		}
		const out: TestElement[] = [];
		const walk = (node: TestNode) => {
			if (node instanceof TestElement) {
				out.push(node);
				for (const child of node.childNodes) {
					walk(child);
				}
			}
		};
		for (const child of this.childNodes) {
			walk(child);
		}
		return out;
	}
}

function append(parent: TestElement, children: TestNode[]): void {
	parent.childNodes = children;
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (!child) continue;
		child.nextSibling = children[i + 1] ?? null;
		if (child instanceof TestElement) {
			child.parentElement = parent;
		}
	}
}

describe("softbreakNewlineToSpace", () => {
	it("turns a softbreak before a word into a space (Mem0 README case)", () => {
		expect(softbreakNewlineToSpace("\nassistants. It provides")).toBe(
			" assistants. It provides",
		);
	});

	it("turns a lone softbreak between marks into a space", () => {
		expect(softbreakNewlineToSpace("\n", { followedByElement: true })).toBe(
			" ",
		);
	});

	it("leaves already-spaced text alone", () => {
		expect(softbreakNewlineToSpace(" assistants")).toBe(" assistants");
	});

	it("leaves a lone newline alone when not followed by an element", () => {
		expect(softbreakNewlineToSpace("\n")).toBe("\n");
		expect(softbreakNewlineToSpace("\n", { followedByElement: false })).toBe(
			"\n",
		);
	});

	it("leaves a newline before more whitespace alone", () => {
		expect(softbreakNewlineToSpace("\n\n")).toBe("\n\n");
		expect(softbreakNewlineToSpace("\n ")).toBe("\n ");
	});

	it("does not touch text without a leading newline", () => {
		expect(softbreakNewlineToSpace("assistants")).toBe("assistants");
	});
});

describe("preserveSoftbreakSpacesInDOM", () => {
	it("inserts a space after a mark when softbreak shares the following text node", () => {
		const root = new TestElement("DIV");
		const p = new TestElement("P");
		const strong = new TestElement("STRONG");
		append(strong, [new TestText("and")]);
		const after = new TestText("\nassistants.");
		append(p, [new TestText("AI agents "), strong, after]);
		append(root, [p]);

		preserveSoftbreakSpacesInDOM(root as unknown as ParentNode);

		expect(after.textContent).toBe(" assistants.");
	});

	it("inserts a space for a lone softbreak between consecutive marks", () => {
		const root = new TestElement("DIV");
		const p = new TestElement("P");
		const first = new TestElement("STRONG");
		const second = new TestElement("STRONG");
		append(first, [new TestText("word1")]);
		append(second, [new TestText("word2")]);
		const softbreak = new TestText("\n");
		append(p, [first, softbreak, second]);
		append(root, [p]);

		preserveSoftbreakSpacesInDOM(root as unknown as ParentNode);

		expect(softbreak.textContent).toBe(" ");
	});

	it("does not rewrite softbreaks inside pre", () => {
		const root = new TestElement("DIV");
		const pre = new TestElement("PRE");
		const code = new TestElement("CODE");
		append(code, [new TestText("x")]);
		const after = new TestText("\ny");
		append(pre, [code, after]);
		append(root, [pre]);

		preserveSoftbreakSpacesInDOM(root as unknown as ParentNode);

		expect(after.textContent).toBe("\ny");
	});
});

describe("PreserveSoftbreakSpaces", () => {
	it("registers a markdown parse.updateDOM hook that walks the DOM", () => {
		const addStorage = PreserveSoftbreakSpaces.config.addStorage;
		expect(typeof addStorage).toBe("function");
		const storage = addStorage?.call({}) as {
			markdown?: { parse?: { updateDOM?: (el: HTMLElement) => void } };
		};
		const updateDOM = storage.markdown?.parse?.updateDOM;
		expect(typeof updateDOM).toBe("function");

		const root = new TestElement("DIV");
		const p = new TestElement("P");
		const strong = new TestElement("STRONG");
		append(strong, [new TestText("and")]);
		const after = new TestText("\nassistants.");
		append(p, [new TestText("AI agents "), strong, after]);
		append(root, [p]);

		updateDOM?.(root as unknown as HTMLElement);
		expect(after.textContent).toBe(" assistants.");
	});
});
