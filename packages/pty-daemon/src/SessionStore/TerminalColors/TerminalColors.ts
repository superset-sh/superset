import {
	type TerminalColors as ConfiguredColors,
	DEFAULT_TERMINAL_ANSI,
	fallbackTerminalColors,
	terminalColorsSchema,
} from "@superset/shared/terminal-colors";

const MAX_OSC_BYTES = 16384;

type State = "ground" | "escape" | "c2" | "osc" | "oscEscape" | "overflow";

export interface TerminalColorsSnapshot {
	defaults: string[];
	overrides: [number, string][];
	state: State;
	pending: number[];
	previousC2?: boolean;
}

function parseColor(value: string): string | undefined {
	const hash = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{9}|[\da-f]{12})$/i.exec(value);
	const rgb = /^rgb:([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})$/i.exec(
		value,
	);
	let channels: string[];
	if (hash) {
		const digits = hash[1] ?? "";
		const width = digits.length / 3;
		channels = [0, 1, 2].map((i) => {
			const n = Number.parseInt(digits.slice(i * width, (i + 1) * width), 16);
			return (width === 1 ? n * 16 : n >>> ((width - 2) * 4))
				.toString(16)
				.padStart(2, "0");
		});
	} else if (
		rgb &&
		rgb[1]?.length === rgb[2]?.length &&
		rgb[2]?.length === rgb[3]?.length
	) {
		channels = rgb.slice(1).map((part) =>
			Math.round((Number.parseInt(part, 16) * 255) / (16 ** part.length - 1))
				.toString(16)
				.padStart(2, "0"),
		);
	} else return;
	return `#${channels.join("")}`;
}

export class TerminalColors {
	private defaults: string[] = [];
	private overrides = new Map<number, string>();
	private state: State = "ground";
	private pending: number[] = [];
	private previousC2 = false;

	constructor(colors?: ConfiguredColors, light = false) {
		this.configure(fallbackTerminalColors(light));
		if (colors) this.configure(colors);
	}

	configure(colors: ConfiguredColors, resetOverrides = false): void {
		const parsed = terminalColorsSchema.safeParse(colors);
		if (!parsed.success) return;
		const value = parsed.data;
		const previous = this.defaults;
		this.defaults = [...(value.ansi ?? DEFAULT_TERMINAL_ANSI)];
		for (let i = 16; i < 232; i++) {
			const n = i - 16;
			const levels = [0, 95, 135, 175, 215, 255];
			this.defaults[i] =
				`#${[Math.floor(n / 36), Math.floor(n / 6) % 6, n % 6].map((v) => (levels[v] ?? 0).toString(16).padStart(2, "0")).join("")}`;
		}
		for (let i = 232; i < 256; i++)
			this.defaults[i] =
				`#${(8 + (i - 232) * 10).toString(16).padStart(2, "0").repeat(3)}`;
		this.defaults.push(value.foreground, value.background, value.cursor);
		if (
			resetOverrides ||
			previous.some(
				(color, index) =>
					color.toLowerCase() !== this.defaults[index]?.toLowerCase(),
			)
		)
			this.overrides.clear();
	}

	snapshot(): TerminalColorsSnapshot {
		return {
			defaults: [...this.defaults],
			overrides: [...this.overrides],
			state: this.state,
			pending: [...this.pending],
			previousC2: this.previousC2,
		};
	}

	restore(snapshot: TerminalColorsSnapshot): void {
		this.defaults = [...snapshot.defaults];
		this.overrides = new Map(snapshot.overrides);
		this.state = snapshot.state;
		this.pending = [...snapshot.pending];
		this.previousC2 = snapshot.previousC2 ?? false;
	}

	flush(): Buffer {
		const bytes = Buffer.from(this.pending);
		this.pending = [];
		this.state = "ground";
		return bytes;
	}

	feed(chunk: Buffer, reply: (bytes: Buffer) => void): Buffer {
		const output: Buffer[] = [];
		let start = 0;
		for (let i = 0; i < chunk.length; i++) {
			const byte = chunk[i] ?? 0;
			const c1End = this.previousC2 && byte === 0x9c;
			this.previousC2 = byte === 0xc2;
			if (this.state === "ground") {
				if (byte !== 0x1b && byte !== 0xc2) continue;
				output.push(chunk.subarray(start, i));
				this.pending = [byte];
				this.state = byte === 0xc2 ? "c2" : "escape";
				start = i + 1;
				continue;
			}
			if (this.state === "c2") {
				if (byte === 0x9d) {
					this.pending.push(byte);
					this.state = "osc";
					start = i + 1;
					continue;
				}
				output.push(Buffer.from(this.pending));
				this.pending = [];
				this.state = "ground";
				i--;
				continue;
			}
			if (this.state === "overflow") {
				if (byte === 0x1b) {
					this.pending = [byte];
					this.state = "escape";
					start = i + 1;
					continue;
				}
				if (this.pending.at(-1) === 0xc2 && byte === 0x9d) {
					this.pending = [0xc2, byte];
					this.state = "osc";
					start = i + 1;
					continue;
				}
				this.pending = byte === 0xc2 ? [byte] : [];
				start = i + 1;
				if (c1End || byte === 0x18 || byte === 0x1a || byte === 7)
					this.state = "ground";
				continue;
			}
			if (
				this.state === "osc" &&
				this.pending.at(-1) === 0xc2 &&
				byte >= 0x80 &&
				byte <= 0x9f &&
				byte !== 0x9c
			) {
				output.push(Buffer.from(this.pending.slice(0, -1)));
				this.pending = [0xc2, byte];
				start = i + 1;
				if (byte === 0x9d) this.state = "osc";
				else {
					output.push(Buffer.from(this.pending));
					this.pending = [];
					this.state = "ground";
				}
				continue;
			}
			if (this.state === "oscEscape" && byte !== 0x5c) {
				const ended = this.handleOsc(Buffer.from(this.pending), "\x1b", reply);
				output.push(ended.at(-1) === 0x1b ? ended.subarray(0, -1) : ended);
				this.pending = [0x1b];
				this.state = "escape";
			}
			this.pending.push(byte);
			start = i + 1;
			if (this.state === "escape") {
				if (
					(byte < 0x20 && byte !== 0x18 && byte !== 0x1a && byte !== 0x1b) ||
					byte === 0x7f
				) {
					if (this.pending.length > MAX_OSC_BYTES) {
						output.push(Buffer.from(this.pending));
						this.pending = [0x1b];
					}
					continue;
				}
				if (byte === 0xc2) {
					output.push(Buffer.from(this.pending.slice(0, -1)));
					this.pending = [byte];
					this.state = "c2";
					continue;
				}
				if (byte === 0x5d) {
					this.state = "osc";
					continue;
				}
				if (byte === 0x1b) {
					output.push(Buffer.from(this.pending.slice(0, -1)));
					this.pending = [0x1b];
					continue;
				}
				if (byte === 0x63) this.overrides.clear();
				output.push(Buffer.from(this.pending));
				this.pending = [];
				this.state = "ground";
				continue;
			}
			if (
				byte === 7 ||
				c1End ||
				(this.state === "oscEscape" && byte === 0x5c)
			) {
				const raw = Buffer.from(this.pending);
				const terminator = byte === 7 ? "\x07" : c1End ? "\xc2\x9c" : "\x1b\\";
				output.push(this.handleOsc(raw, terminator, reply));
				this.pending = [];
				this.state = "ground";
			} else if (
				byte === 0x18 ||
				byte === 0x1a ||
				this.pending.length > MAX_OSC_BYTES
			) {
				const raw = Buffer.from(this.pending);
				const header =
					Buffer.from(
						raw
							.subarray(raw[0] === 0x1b ? raw.indexOf(0x5d) + 1 : 2)
							.filter((value) => value >= 0x20),
					)
						.toString("latin1")
						.split(";", 1)[0] ?? "";
				const identifier = Number(header);
				const discardOverflow =
					this.pending.length > MAX_OSC_BYTES &&
					/^\d+$/.test(header) &&
					([4, 10, 11, 12, 104, 110, 111, 112].includes(identifier) ||
						(!raw.includes(0x3b) && identifier === 0));
				if (!discardOverflow) output.push(raw);
				this.pending = [];
				this.state = discardOverflow ? "overflow" : "ground";
			} else this.state = byte === 0x1b ? "oscEscape" : "osc";
		}
		output.push(chunk.subarray(start));
		return output.length === 1
			? (output[0] ?? Buffer.alloc(0))
			: Buffer.concat(output);
	}

	private handleOsc(
		raw: Buffer,
		terminator: string,
		reply: (bytes: Buffer) => void,
	): Buffer {
		// Keep xterm's transition out of any control sequence this OSC interrupted.
		const introducerLength = raw[0] === 0x1b ? raw.indexOf(0x5d) + 1 : 2;
		const emptyOsc = Buffer.concat([
			raw.subarray(0, introducerLength),
			Buffer.from([7]),
		]);
		const body = Buffer.from(
			raw
				.subarray(introducerLength, raw.length - terminator.length)
				.filter((byte) => byte >= 0x20),
		).toString("latin1");
		const parts = body.split(";");
		const identifier = parts.shift() ?? "";
		const command = /^\d+$/.test(identifier)
			? String(Number(identifier))
			: identifier;
		const emit = (code: string, index: number) => {
			const hex =
				this.overrides.get(index) ?? this.defaults[index] ?? "#000000";
			const rgb = [1, 3, 5]
				.map((offset) => hex.slice(offset, offset + 2).repeat(2))
				.join("/");
			reply(Buffer.from(`\x1b]${code};rgb:${rgb}\x1b\\`));
		};
		const set = (index: number, value: string) => {
			const color = parseColor(value);
			if (color) this.overrides.set(index, color);
		};
		if (command === "4") {
			const retained: string[] = [];
			let queried = false;
			for (let i = 0; i + 1 < parts.length; i += 2) {
				const key = parts[i] ?? "";
				const value = parts[i + 1] ?? "";
				const index = /^\d+$/.test(key) ? Number(key) : -1;
				if (index >= 0 && index < 256 && value === "?") {
					emit(`4;${index}`, index);
					queried = true;
				} else {
					if (index >= 0 && index < 256) set(index, value);
					retained.push(key, value);
				}
			}
			if (parts.length % 2) retained.push(parts.at(-1) ?? "");
			return !queried
				? raw
				: Buffer.concat([
						emptyOsc,
						retained.length
							? Buffer.from(
									`\x1b]4;${retained.join(";")}${terminator}`,
									"latin1",
								)
							: Buffer.alloc(0),
					]);
		}
		if (command === "10" || command === "11" || command === "12") {
			const first = Number(command);
			const retained: string[] = [];
			for (let i = 0; i < parts.length && first + i <= 12; i++) {
				const code = first + i;
				const value = parts[i] ?? "";
				if (value === "?") emit(String(code), 256 + code - 10);
				else {
					set(256 + code - 10, value);
					retained.push(`\x1b]${code};${value}${terminator}`);
				}
			}
			if (!parts.includes("?")) return raw;
			return Buffer.concat([
				emptyOsc,
				Buffer.from(retained.join(""), "latin1"),
			]);
		}
		if (command === "104") {
			if (parts.length === 0 || parts.join("") === "") {
				for (let i = 0; i < 256; i++) this.overrides.delete(i);
			} else
				for (const part of parts)
					if (/^\d+$/.test(part) && Number(part) < 256)
						this.overrides.delete(Number(part));
		} else if (["110", "111", "112"].includes(command ?? ""))
			this.overrides.delete(256 + Number(command) - 110);
		return raw;
	}
}
