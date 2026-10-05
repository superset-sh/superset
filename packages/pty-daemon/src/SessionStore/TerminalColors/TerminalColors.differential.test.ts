import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { TerminalColors } from "./TerminalColors.ts";

const require = createRequire(import.meta.url);
const { Terminal } =
	require("@xterm/headless") as typeof import("@xterm/headless");

async function render(data: Buffer) {
	const terminal = new Terminal({ allowProposedApi: true });
	const titles: string[] = [];
	let queries = 0;
	terminal.parser.registerOscHandler(11, (value) => {
		if (value.split(";")[0] === "?") queries++;
		return true;
	});
	terminal.parser.registerOscHandler(0, (value) => {
		titles.push(value);
		return true;
	});
	try {
		await new Promise<void>((resolve) => terminal.write(data, resolve));
		return {
			text: terminal.buffer.active.getLine(0)?.translateToString(true),
			cursorX: terminal.buffer.active.cursorX,
			cursorY: terminal.buffer.active.cursorY,
			titles,
			queries,
		};
	} finally {
		terminal.dispose();
	}
}

for (const prefix of [
	"\x1b[31",
	"\x1bPqpayload",
	"\x1b_Gpayload",
	"\x1b^payload",
	"\x1bXpayload",
	"\x1b]0;pending",
]) {
	for (const introducer of ["\x1b]", "\u009d", "\x1b\t]", "\x1b\x7f]"]) {
		for (const terminator of ["\x07", "\x1b\\", "\u009c"]) {
			test(`preserves xterm boundaries ${JSON.stringify([prefix, introducer, terminator])}`, async () => {
				const input = Buffer.from(
					`${prefix}${introducer}11;?${terminator}tail`,
				);
				let expected: Buffer<ArrayBuffer> | undefined;
				for (let split = 0; split <= input.length; split++) {
					const colors = new TerminalColors();
					const replies: Buffer[] = [];
					const reply = (data: Buffer) => replies.push(data);
					const output = Buffer.concat([
						colors.feed(input.subarray(0, split), reply),
						colors.feed(input.subarray(split), reply),
					]);
					expect(replies).toHaveLength(1);
					expect(colors.snapshot().pending).toHaveLength(0);
					if (expected) expect(output).toEqual(expected);
					else expected = output;
				}
				const original = await render(input);
				expect(original.queries).toBe(1);
				expect(await render(expected ?? Buffer.alloc(0))).toEqual({
					...original,
					queries: 0,
				});
			});
		}
	}
}

test("interrupted oversized color controls do not hide a subsequent query", async () => {
	for (const introducer of ["\x1b]", "\u009d"]) {
		const colors = new TerminalColors();
		const replies: Buffer[] = [];
		const input = Buffer.from(
			`\x1b]11;${"x".repeat(17000)}${introducer}11;?\x07tail`,
		);
		const output = Buffer.concat(
			[...input].map((byte) =>
				colors.feed(Buffer.from([byte]), (reply) => replies.push(reply)),
			),
		);
		expect(replies).toHaveLength(1);
		expect(await render(output)).toMatchObject({ text: "tail", queries: 0 });
	}
});

test("mixed C1 query and setter preserve cancellation of a previous title", async () => {
	const input = Buffer.from("\x1b]0;pending\u009d11;?;#abcdef\x07tail");
	const colors = new TerminalColors();
	const replies: Buffer[] = [];
	const output = colors.feed(input, (reply) => replies.push(reply));
	const original = await render(input);
	expect(original.titles).toEqual([]);
	expect(replies).toHaveLength(1);
	expect(await render(output)).toEqual({ ...original, queries: 0 });
});

test("ignored C0 bytes cannot bypass the oversized color limit", async () => {
	const colors = new TerminalColors();
	const replies: Buffer[] = [];
	const input = Buffer.from(`\x1b]1\t1;?;${"x".repeat(20000)}\x07tail`);
	const output = colors.feed(input, (reply) => replies.push(reply));
	expect((await render(input)).queries).toBe(1);
	expect(await render(output)).toMatchObject({ text: "tail", queries: 0 });
	expect(replies).toHaveLength(0);
});
