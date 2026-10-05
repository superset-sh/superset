import { describe, expect, test } from "bun:test";
import { TerminalColors } from "./TerminalColors.ts";

const theme = {
	foreground: "#eae8e6",
	background: "#151110",
	cursor: "#ff8800",
};
const osc = (body: string, end = "\x1b\\") => `\x1b]${body}${end}`;
const emptyOsc = "\x1b]\x07";
const backgroundReply = osc("11;rgb:1515/1111/1010");

function harness(colors = new TerminalColors(theme)) {
	const replies: string[] = [];
	const feed = (data: string | Buffer) =>
		colors.feed(Buffer.from(data), (reply) => replies.push(reply.toString()));
	return { colors, replies, feed };
}

describe("daemon terminal color queries", () => {
	for (const terminator of ["\x07", "\x1b\\"]) {
		test(`answers each split of ${JSON.stringify(terminator)} exactly once`, () => {
			const input = Buffer.from(`before${osc("11;?", terminator)}after`);
			for (let split = 0; split <= input.length; split++) {
				const h = harness();
				expect(
					Buffer.concat([
						h.feed(input.subarray(0, split)),
						h.feed(input.subarray(split)),
					]).toString(),
				).toBe(`before${emptyOsc}after`);
				expect(h.replies).toEqual([backgroundReply]);
			}
		});
	}

	test("handles byte-by-byte adjacent and chained queries", () => {
		const h = harness();
		const input = Buffer.from(`${osc("10;?;?;?")}${osc("4;0;?;255;?")}`);
		const output = [...input].map((byte) => h.feed(Buffer.from([byte])));
		expect(Buffer.concat(output).toString()).toBe(emptyOsc.repeat(2));
		expect(h.replies).toEqual([
			osc("10;rgb:eaea/e8e8/e6e6"),
			backgroundReply,
			osc("12;rgb:ffff/8888/0000"),
			osc("4;0;rgb:2e2e/3434/3636"),
			osc("4;255;rgb:eeee/eeee/eeee"),
		]);
	});

	test("numeric identifiers and unmatched indexed fields do not leak queries", () => {
		const h = harness();
		expect(h.feed(osc("011;?")).toString()).toBe(emptyOsc);
		expect(h.feed(osc("4;0001;?;2")).toString()).toBe(emptyOsc + osc("4;2"));
		expect(h.replies).toEqual([backgroundReply, osc("4;1;rgb:cccc/0000/0000")]);
	});

	test("preserves invalid high-bit payloads without ascii masking", () => {
		const h = harness();
		const input = Buffer.from("1b5d31313bbf07", "hex");
		expect(h.feed(input)).toEqual(input);
		expect(h.replies).toEqual([]);
	});

	test("preserves unrelated output including utf8, control strings and other OSCs", () => {
		const h = harness();
		const input = Buffer.from(
			`🙂漢字${["7;file://host/tmp", "8;;https://example.com", "52;c;SGVsbG8=", "133;A", "777;ready"].map((s) => osc(s)).join("")}\x1bPignored payload\x1b\\tail`,
		);
		const output = [...input].map((byte) => h.feed(Buffer.from([byte])));
		expect(Buffer.concat(output)).toEqual(input);
		expect(h.replies).toEqual([]);
	});

	test("setters and resets affect reports and retain visual changes", () => {
		const h = harness();
		for (const setter of [
			osc("11;#abc"),
			osc("10;rgb:f/8/0"),
			osc("4;22;#123456"),
		])
			expect(h.feed(setter).toString()).toBe(setter);
		h.feed(osc("10;?;?"));
		h.feed(osc("4;22;?"));
		expect(h.replies).toEqual([
			osc("10;rgb:ffff/8888/0000"),
			osc("11;rgb:a0a0/b0b0/c0c0"),
			osc("4;22;rgb:1212/3434/5656"),
		]);
		for (const reset of [osc("110"), osc("111"), osc("104;22")])
			expect(h.feed(reset).toString()).toBe(reset);
		h.feed(osc("11;?"));
		expect(h.replies.at(-1)).toBe(backgroundReply);
	});

	test("mixed setters and queries retain only setter effects", () => {
		const h = harness();
		expect(h.feed(osc("10;#123456;?;#abcdef")).toString()).toBe(
			emptyOsc + osc("10;#123456") + osc("12;#abcdef"),
		);
		expect(h.feed(osc("4;1;#123456;1;?;2;#abcdef")).toString()).toBe(
			emptyOsc + osc("4;1;#123456;2;#abcdef"),
		);
		expect(h.replies).toEqual([backgroundReply, osc("4;1;rgb:1212/3434/5656")]);
	});

	test("invalid setters leave the previous value intact", () => {
		const h = harness();
		const input = osc("11;no-such-color");
		expect(h.feed(input).toString()).toBe(input);
		h.feed(osc("11;?"));
		expect(h.replies).toEqual([backgroundReply]);
	});

	test("cancellation and incomplete sequences preserve bytes", () => {
		const h = harness();
		for (const cancel of ["\x18", "\x1a"]) {
			const input = `\x1b]11;?${cancel}plain`;
			expect(h.feed(input).toString()).toBe(input);
		}
		expect(h.feed("\x1b]11;").length).toBe(0);
		expect(h.colors.flush().toString()).toBe("\x1b]11;");
		expect(h.replies).toEqual([]);
	});

	test("oversized unrelated OSC has bounded carry and preserves all bytes", () => {
		const h = harness();
		const input = Buffer.from(osc(`52;c;${"x".repeat(40000)}`));
		const first = h.feed(input.subarray(0, 30000));
		expect(h.colors.snapshot().pending.length).toBeLessThanOrEqual(16384);
		expect(Buffer.concat([first, h.feed(input.subarray(30000))])).toEqual(
			input,
		);
		expect(h.replies).toEqual([]);
	});

	test("handoff preserves defaults, overrides and split query without replaying replies", () => {
		const before = harness();
		before.feed(osc("11;#123456"));
		before.feed("\x1b]11;?\x1b");
		const after = harness();
		after.colors.restore(JSON.parse(JSON.stringify(before.colors.snapshot())));
		expect(after.feed("\\").toString()).toBe(emptyOsc);
		expect(before.replies).toEqual([]);
		expect(after.replies).toEqual([osc("11;rgb:1212/3434/5656")]);
	});

	test("fallback is deliberate dark or light and configuration updates reset targets", () => {
		for (const light of [false, true]) {
			const h = harness(new TerminalColors(undefined, light));
			h.feed(osc("11;?"));
			expect(h.replies).toEqual([
				osc(light ? "11;rgb:ffff/ffff/ffff" : "11;rgb:0000/0000/0000"),
			]);
			h.colors.configure(theme);
			h.feed(osc("11;?"));
			expect(h.replies.at(-1)).toBe(backgroundReply);
		}
	});
});

test("UTF-8 C1 OSC/ST and ordinary C2 characters remain distinct at every split", () => {
	const input = Buffer.from(`£\u009d11;?\u009c©`);
	for (let split = 0; split <= input.length; split++) {
		const h = harness();
		expect(
			Buffer.concat([
				h.feed(input.subarray(0, split)),
				h.feed(input.subarray(split)),
			]).toString(),
		).toBe("£\u009d\x07©");
		expect(h.replies).toEqual([backgroundReply]);
	}
});

test("ESC ends an OSC query before a following non-ST control sequence", () => {
	const h = harness();
	expect(h.feed("\x1b]11;?\x1b[31mred").toString()).toBe(
		`${emptyOsc}\x1b[31mred`,
	);
	expect(h.replies).toEqual([backgroundReply]);
});

test("actual theme changes reset OSC overrides but identical reconnect sync does not", () => {
	const h = harness();
	h.feed(osc("11;#123456"));
	h.colors.configure({ ...theme });
	h.feed(osc("11;?"));
	expect(h.replies.at(-1)).toBe(osc("11;rgb:1212/3434/5656"));
	h.colors.configure({ ...theme, background: "#ffffff" });
	h.feed(osc("11;?"));
	expect(h.replies.at(-1)).toBe(osc("11;rgb:ffff/ffff/ffff"));
	h.feed(osc("11;#654321") + osc("111") + osc("11;?"));
	expect(h.replies.at(-1)).toBe(osc("11;rgb:ffff/ffff/ffff"));
});

test("over-limit color controls are rejected instead of leaking queries to observers", () => {
	const h = harness();
	const input = Buffer.from(
		`before${osc(`4;1;?;2;${"0".repeat(20000)}`)}after`,
	);
	const first = h.feed(input.subarray(0, 18000));
	expect(h.colors.snapshot().pending).toHaveLength(0);
	expect(Buffer.concat([first, h.feed(input.subarray(18000))]).toString()).toBe(
		"before\x1b\\after",
	);
	expect(h.replies).toEqual([]);
});
