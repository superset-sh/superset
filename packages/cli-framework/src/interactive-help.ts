import {
	type CommandNode,
	generateCommandHelp,
	type HelpBranding,
	paint,
} from "./help";
import type { ProcessedBuilderConfig } from "./option";

/**
 * EXPERIMENT: interactive help browser shown when the CLI is invoked bare on a
 * TTY. Arrow keys walk the command tree; Enter drills in. Leaves with no
 * required inputs run immediately; leaves that need input walk the user
 * through each required field (text input, enum selector, yes/no) and then
 * run the assembled command.
 *
 * Zero-dep on purpose: raw-mode stdin + ANSI, so it works in the compiled
 * binary without pulling ink/clack into the framework.
 */

interface Row {
	name: string;
	node: CommandNode;
}

export interface FormField {
	kind: "positional" | "flag";
	/** kebab-case flag name (without --) or positional name. */
	name: string;
	description?: string;
	type: "string" | "number" | "boolean";
	enumVals?: string[];
	variadic?: boolean;
}

export interface InteractiveResult {
	/** Args to execute after the browser exits (e.g. ["workspaces","list"]). */
	runArgs?: string[];
}

const ESC = "\x1b";
const hide = `${ESC}[?25l`;
const show = `${ESC}[?25h`;

function rows(node: CommandNode): Row[] {
	return [...node.children.entries()]
		.filter(([, n]) => n.children.size > 0 || n.hasCommand)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, n]) => ({ name, node: n }));
}

function isRequired(c: ProcessedBuilderConfig): boolean {
	return c.isRequired === true && c.default === undefined;
}

/** Required inputs for a leaf, positionals first, in declaration order. */
export function collectRequiredFields(node: CommandNode): FormField[] {
	const fields: FormField[] = [];
	for (const arg of node.args ?? []) {
		if (!isRequired(arg)) continue;
		fields.push({
			kind: "positional",
			name: arg.name ?? "arg",
			description: arg.description,
			type: arg.type === "number" ? "number" : "string",
			enumVals: arg.enumVals,
			variadic: arg.isVariadic,
		});
	}
	for (const config of Object.values(node.options ?? {})) {
		if (config.type === "positional" || config.isHidden) continue;
		if (!isRequired(config)) continue;
		fields.push({
			kind: "flag",
			name: config.name,
			description: config.description,
			type:
				config.type === "number"
					? "number"
					: config.type === "boolean"
						? "boolean"
						: "string",
			enumVals: config.enumVals,
			variadic: config.isVariadic,
		});
	}
	return fields;
}

/** Variadic fields accept one space-separated line and expand to many argv. */
function splitVariadic(value: string): string[] {
	return value.trim().split(/\s+/).filter(Boolean);
}

/** Assemble argv for execute(): path, then positionals, then --flag value. */
export function buildRunArgs(
	path: string[],
	fields: FormField[],
	values: Array<string | boolean>,
): string[] {
	const args = [...path];
	for (const [i, field] of fields.entries()) {
		const value = values[i];
		if (field.kind === "positional") {
			if (typeof value === "string" && value !== "") {
				if (field.variadic) args.push(...splitVariadic(value));
				else args.push(value);
			}
			continue;
		}
		if (field.type === "boolean") {
			// A required boolean must appear either way; the parser supports
			// --no-<flag> negation.
			if (value === true) args.push(`--${field.name}`);
			else if (value === false) args.push(`--no-${field.name}`);
			continue;
		}
		if (typeof value === "string" && value !== "") {
			if (field.variadic) {
				for (const part of splitVariadic(value)) {
					args.push(`--${field.name}`, part);
				}
			} else {
				args.push(`--${field.name}`, value);
			}
		}
	}
	return args;
}

export function formatAssembledCommand(
	name: string,
	path: string[],
	fields: FormField[],
	values: Array<string | boolean>,
): string {
	const parts = [name, ...buildRunArgs(path, fields, values)].map((part) =>
		/[\s"']/.test(part) ? JSON.stringify(part) : part,
	);
	return parts.join(" ");
}

function render(
	name: string,
	version: string,
	branding: HelpBranding | undefined,
	path: string[],
	list: Row[],
	selected: number,
): string {
	const out: string[] = [];
	out.push(`${paint.bold(paint.cyan(name))} ${paint.dim(`v${version}`)}`);
	if (branding?.tagline) out.push(paint.dim(branding.tagline));
	out.push("");
	const crumbs = [name, ...path].join(" › ");
	out.push(`${paint.dim("›")} ${paint.bold(crumbs)}`);
	out.push("");
	for (const [i, row] of list.entries()) {
		const isGroup = row.node.children.size > 0;
		const label = `${row.name}${row.node.aliases?.length ? ` (${row.node.aliases.join(", ")})` : ""}`;
		const suffix = isGroup ? paint.dim(" ›") : "";
		const desc = row.node.description
			? paint.dim(`  ${row.node.description}`)
			: "";
		out.push(
			i === selected
				? paint.invert(
						`❯ ${label}${isGroup ? " ›" : ""}  ${row.node.description ?? ""}`,
					)
				: `  ${label}${suffix}${desc}`,
		);
	}
	out.push("");
	const hints = [
		`${paint.bold("↑↓")} move`,
		`${paint.bold("enter")} open`,
		path.length > 0 ? `${paint.bold("←")} back` : undefined,
		`${paint.bold("q")} quit`,
	].filter(Boolean);
	out.push(paint.dim(hints.join("   ")));
	if (branding?.docsUrl) out.push(paint.dim(`docs: ${branding.docsUrl}`));
	return out.join("\n");
}

function renderLeaf(
	name: string,
	path: string[],
	node: CommandNode,
	globals: Record<string, ProcessedBuilderConfig> | undefined,
	fieldCount: number,
): string {
	const out: string[] = [];
	out.push(generateCommandHelp(name, path, node, globals));
	out.push("");
	if (fieldCount === 0) {
		out.push(paint.green(`$ ${[name, ...path].join(" ")}`));
		out.push(
			paint.dim(
				`${paint.bold("enter")} run it now   ${paint.bold("←")} back   ${paint.bold("q")} quit`,
			),
		);
	} else {
		out.push(
			paint.green(`$ ${[name, ...path].join(" ")} …`) +
				paint.dim(
					`  (${fieldCount} required input${fieldCount === 1 ? "" : "s"})`,
				),
		);
		out.push(
			paint.dim(
				`${paint.bold("enter")} fill in & run   ${paint.bold("←")} back   ${paint.bold("q")} quit`,
			),
		);
	}
	return out.join("\n");
}

interface FormState {
	fields: FormField[];
	values: Array<string | boolean>;
	index: number;
	buffer: string;
	enumIndex: number;
	confirming: boolean;
}

function renderForm(name: string, path: string[], form: FormState): string {
	const out: string[] = [];
	const crumbs = [name, ...path].join(" › ");
	out.push(`${paint.dim("›")} ${paint.bold(crumbs)}`);
	out.push("");

	// Completed fields
	for (let i = 0; i < form.index; i++) {
		const field = form.fields[i];
		if (!field) continue;
		const value = form.values[i];
		const label = field.kind === "flag" ? `--${field.name}` : `<${field.name}>`;
		out.push(
			`  ${paint.green("✓")} ${paint.dim(label)}  ${typeof value === "boolean" ? (value ? "yes" : "no") : value}`,
		);
	}

	if (form.confirming) {
		out.push("");
		out.push(`  ${paint.bold("Ready:")}`);
		out.push(
			`  ${paint.green(`$ ${formatAssembledCommand(name, path, form.fields, form.values)}`)}`,
		);
		out.push("");
		out.push(
			paint.dim(
				`${paint.bold("enter")} run   ${paint.bold("←")} edit last   ${paint.bold("esc")} cancel`,
			),
		);
		return out.join("\n");
	}

	const field = form.fields[form.index];
	if (!field) return out.join("\n");
	const label = field.kind === "flag" ? `--${field.name}` : `<${field.name}>`;
	out.push("");
	out.push(
		`  ${paint.cyan(label)}${field.description ? paint.dim(`  ${field.description}`) : ""}  ${paint.dim(`(${form.index + 1}/${form.fields.length})`)}`,
	);

	if (field.enumVals?.length) {
		for (const [i, value] of field.enumVals.entries()) {
			out.push(
				i === form.enumIndex
					? `  ${paint.invert(`❯ ${value}`)}`
					: `    ${value}`,
			);
		}
		out.push("");
		out.push(
			paint.dim(
				`${paint.bold("↑↓")} choose   ${paint.bold("enter")} select   ${paint.bold("esc")} cancel`,
			),
		);
	} else if (field.type === "boolean") {
		out.push(`  ${paint.bold("y")}es / ${paint.bold("n")}o`);
		out.push("");
		out.push(paint.dim(`${paint.bold("esc")} cancel`));
	} else {
		const inputHints = [
			field.type === "number" ? "number" : undefined,
			field.variadic ? "space-separated for multiple" : undefined,
		].filter(Boolean);
		out.push(
			`  ${paint.bold("›")} ${form.buffer}${paint.invert(" ")}${inputHints.length > 0 ? `  ${paint.dim(`(${inputHints.join(", ")})`)}` : ""}`,
		);
		out.push("");
		out.push(
			paint.dim(
				`${paint.bold("enter")} next   ${paint.bold("esc")} cancel   type to edit`,
			),
		);
	}
	return out.join("\n");
}

export async function runInteractiveHelp(opts: {
	name: string;
	version: string;
	root: CommandNode;
	globals?: Record<string, ProcessedBuilderConfig>;
	branding?: HelpBranding;
	populateLeaf: (path: string[], node: CommandNode) => void;
	signal?: AbortSignal;
}): Promise<InteractiveResult> {
	const { name, version, root, globals, branding, populateLeaf, signal } = opts;
	const stdin = process.stdin;
	const stdout = process.stdout;

	let path: string[] = [];
	let stack: CommandNode[] = [root];
	let selected = 0;
	let leaf: CommandNode | null = null;
	let leafFields: FormField[] = [];
	let form: FormState | null = null;
	let lastLineCount = 0;

	const paintFrame = (frame: string) => {
		// Repaint in place: move to frame top, clear below, rewrite.
		if (lastLineCount > 0) stdout.write(`${ESC}[${lastLineCount}A`);
		stdout.write(`${ESC}[0J`);
		stdout.write(`${frame}\n`);
		lastLineCount = frame.split("\n").length;
	};

	const draw = () => {
		const current = stack[stack.length - 1] ?? root;
		const frame = form
			? renderForm(name, path, form)
			: leaf
				? renderLeaf(name, path, leaf, globals, leafFields.length)
				: render(name, version, branding, path, rows(current), selected);
		paintFrame(frame);
	};

	stdin.setRawMode?.(true);
	stdin.resume();
	stdout.write(hide);

	// The terminal must be restored on EVERY exit path — normal finish, an
	// exception inside the key handler, SIGINT/SIGTERM (via the runner's
	// abort signal), or process exit — or the user's shell is left in raw
	// mode with a hidden cursor.
	let cleaned = false;
	const cleanup = () => {
		if (cleaned) return;
		cleaned = true;
		stdin.setRawMode?.(false);
		stdin.pause();
		stdout.write(show);
	};
	process.on("exit", cleanup);

	return new Promise<InteractiveResult>((resolvePromise, rejectPromise) => {
		const teardown = () => {
			cleanup();
			stdin.off("data", onData);
			process.off("exit", cleanup);
			signal?.removeEventListener("abort", onAbort);
		};
		const finish = (result: InteractiveResult) => {
			teardown();
			resolvePromise(result);
		};
		const fail = (error: unknown) => {
			teardown();
			rejectPromise(error);
		};
		const onAbort = () => finish({});
		signal?.addEventListener("abort", onAbort, { once: true });
		if (signal?.aborted) {
			finish({});
			return;
		}

		const closeLeaf = () => {
			leaf = null;
			leafFields = [];
			path = path.slice(0, -1);
		};

		const commitFormValue = (value: string | boolean) => {
			if (!form) return;
			form.values[form.index] = value;
			form.index++;
			form.buffer = "";
			form.enumIndex = 0;
			if (form.index >= form.fields.length) form.confirming = true;
		};

		const handleFormKey = (key: string): InteractiveResult | undefined => {
			if (!form) return;
			if (key === "\x03") return {};
			if (key === ESC) {
				form = null;
				return undefined;
			}

			if (form.confirming) {
				if (key === "\r") {
					return { runArgs: buildRunArgs(path, form.fields, form.values) };
				}
				if (key === `${ESC}[D` || key === "\x7f") {
					// Edit the last field again.
					form.confirming = false;
					form.index = Math.max(0, form.index - 1);
					const prev = form.values[form.index];
					form.buffer = typeof prev === "string" ? prev : "";
				}
				return undefined;
			}

			const field = form.fields[form.index];
			if (!field) return undefined;
			if (field.enumVals?.length) {
				const n = field.enumVals.length;
				if (key === `${ESC}[A`) form.enumIndex = (form.enumIndex - 1 + n) % n;
				else if (key === `${ESC}[B`) form.enumIndex = (form.enumIndex + 1) % n;
				else if (key === "\r") {
					const value = field.enumVals[form.enumIndex];
					if (value !== undefined) commitFormValue(value);
				}
				return undefined;
			}
			if (field.type === "boolean") {
				if (key === "y" || key === "Y") commitFormValue(true);
				else if (key === "n" || key === "N") commitFormValue(false);
				return undefined;
			}
			// Text input
			if (key === "\r") {
				const trimmed = form.buffer.trim();
				if (trimmed === "") return undefined;
				// Numbers fail fast here instead of after the browser closes.
				if (field.type === "number" && Number.isNaN(Number(trimmed))) {
					return undefined;
				}
				commitFormValue(trimmed);
				return undefined;
			}
			if (key === "\x7f") {
				form.buffer = form.buffer.slice(0, -1);
				return undefined;
			}
			// Printable chars only (skip other escape sequences).
			if (!key.startsWith(ESC) && key >= " ") form.buffer += key;
			return undefined;
		};

		// Hoisted: teardown() references onData, and the already-aborted branch
		// above runs teardown before this point in the source.
		function onData(data: Buffer) {
			try {
				handleKey(data.toString());
			} catch (error) {
				fail(error);
			}
		}

		const handleKey = (key: string) => {
			if (form) {
				const result = handleFormKey(key);
				if (result) return finish(result);
				draw();
				return;
			}

			const current = stack[stack.length - 1] ?? root;
			const list = rows(current);

			if (key === "\x03" || key === "q") return finish({});
			if (key === `${ESC}[A` || key === "k") {
				if (!leaf && list.length > 0)
					selected = (selected - 1 + list.length) % list.length;
			} else if (key === `${ESC}[B` || key === "j") {
				if (!leaf && list.length > 0) selected = (selected + 1) % list.length;
			} else if (key === `${ESC}[D` || key === "\x7f" || key === ESC) {
				if (leaf) {
					closeLeaf();
				} else if (stack.length > 1) {
					stack = stack.slice(0, -1);
					path = path.slice(0, -1);
					selected = 0;
				} else {
					return finish({});
				}
			} else if (key === "\r" || key === `${ESC}[C`) {
				if (leaf) {
					if (key !== "\r") return;
					if (leafFields.length === 0) {
						return finish({ runArgs: [...path] });
					}
					form = {
						fields: leafFields,
						values: [],
						index: 0,
						buffer: "",
						enumIndex: 0,
						confirming: false,
					};
				} else {
					const row = list[selected];
					if (!row) return;
					if (row.node.children.size > 0) {
						stack = [...stack, row.node];
						path = [...path, row.name];
						selected = 0;
					} else {
						path = [...path, row.name];
						populateLeaf(path, row.node);
						leaf = row.node;
						leafFields = collectRequiredFields(row.node);
					}
				}
			}
			draw();
		};

		stdin.on("data", onData);
		draw();
	});
}
