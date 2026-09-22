export interface ControlSequenceScannerSnapshot {
	state: "ground" | "escape" | "csi" | "osc" | "string";
	sequence: string | null;
	utf8Remaining: number;
	utf8Lead: number;
}

interface ControlSequenceHandlers {
	escape(sequence: string, final: string): void;
	csi(sequence: string, final: string): void;
	osc(sequence: string): void;
}

const MAX_SEQUENCE_LENGTH = 256;

export class ControlSequenceScanner {
	private value: ControlSequenceScannerSnapshot = {
		state: "ground",
		sequence: "",
		utf8Remaining: 0,
		utf8Lead: 0,
	};

	private readonly handlers: ControlSequenceHandlers;

	constructor(handlers: ControlSequenceHandlers) {
		this.handlers = handlers;
	}

	snapshot(): ControlSequenceScannerSnapshot {
		return { ...this.value };
	}

	restore(snapshot: ControlSequenceScannerSnapshot): void {
		this.value = { ...snapshot };
	}

	feed(bytes: Uint8Array): void {
		for (const byte of bytes) {
			const parser = this.value;
			if (parser.utf8Remaining > 0 && byte >= 0x80 && byte <= 0xbf) {
				parser.utf8Remaining--;
				if (parser.utf8Remaining === 0)
					this.consume(parser.utf8Lead === 0xc2 && byte <= 0x9f ? byte : 0xa0);
				continue;
			}
			if (parser.utf8Remaining > 0) this.consume(0xa0);
			parser.utf8Remaining = 0;
			if (byte >= 0xc2 && byte <= 0xf4) {
				parser.utf8Lead = byte;
				parser.utf8Remaining = byte < 0xe0 ? 1 : byte < 0xf0 ? 2 : 3;
				continue;
			}
			this.consume(byte < 0x80 ? byte : 0xa0);
		}
	}

	private consume(byte: number): void {
		const parser = this.value;
		if (parser.state === "ground" && byte >= 0x20 && byte < 0x80) return;
		if (byte === 0x18 || byte === 0x1a) {
			parser.state = "ground";
			parser.sequence = "";
			return;
		}
		if (byte === 0x1b) {
			if (parser.state === "osc") this.finishOsc();
			parser.state = "escape";
			parser.sequence = "";
			return;
		}
		if (byte === 0x9b) {
			parser.state = "csi";
			parser.sequence = "";
			return;
		}
		if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(byte)) {
			parser.state = byte === 0x9d ? "osc" : "string";
			parser.sequence = "";
			return;
		}
		if (byte === 0x9c || (byte === 7 && parser.state === "osc")) {
			if (parser.state === "osc") this.finishOsc();
			parser.state = "ground";
			parser.sequence = "";
			return;
		}
		if (byte < 0x20 || byte === 0x7f) return;
		const char = String.fromCharCode(byte);
		if (parser.state === "escape") {
			if (char === "[" && parser.sequence === "") parser.state = "csi";
			else if (char === "]" && parser.sequence === "") parser.state = "osc";
			else if ("PX^_".includes(char) && parser.sequence === "")
				parser.state = "string";
			else if (byte >= 0x20 && byte <= 0x2f) this.append(char);
			else {
				if (parser.sequence !== null)
					this.handlers.escape(parser.sequence, char);
				this.value.state = "ground";
				this.value.sequence = "";
			}
		} else if (parser.state === "osc") {
			this.append(char);
		} else if (parser.state === "csi") {
			if (byte >= 0x40 && byte <= 0x7e) {
				if (parser.sequence !== null) this.handlers.csi(parser.sequence, char);
				this.value.state = "ground";
				this.value.sequence = "";
			} else this.append(char);
		}
	}

	private finishOsc(): void {
		if (this.value.sequence !== null) this.handlers.osc(this.value.sequence);
	}

	private append(char: string): void {
		const parser = this.value;
		if (parser.sequence === null) return;
		parser.sequence =
			parser.sequence.length < MAX_SEQUENCE_LENGTH
				? parser.sequence + char
				: null;
	}
}
