import type { TerminalOutputFilter } from "../terminal-output-filter";

const ESC = "\\x1b";
const BEL = "\\x07";

// OSC 10/11/12 color responses: \e]1X;rgb:RRRR/GGGG/BBBB\a or \e]1X;rgb:RRRR/GGGG/BBBB\e\\
const OSC_COLOR_RESPONSE = new RegExp(
	`${ESC}\\]1[0-2];rgb:[0-9a-fA-F]{4}/[0-9a-fA-F]{4}/[0-9a-fA-F]{4}(?:${BEL}|${ESC}\\\\)`,
	"g",
);

// Device Attributes response: \e[?...c
const DA_RESPONSE = new RegExp(`${ESC}\\[\\?[0-9;]*c`, "g");

// Cursor Position Report: \e[row;colR
const CPR_RESPONSE = new RegExp(`${ESC}\\[[0-9]+;[0-9]+R`, "g");

// Partial OSC responses without ESC prefix: 1X;rgb:XXXX/XXXX/XXXX...
const PARTIAL_OSC_COLOR =
	/1[0-2];rgb:[0-9a-fA-F]{4}\/[0-9a-fA-F]{4}\/[0-9a-fA-F]{4}(?:1R)?/g;

export const oscResponseFilter: TerminalOutputFilter = {
	id: "osc-response",
	description: "Filters terminal query responses (OSC colors, DA, CPR)",

	filter(data: string): string {
		return data
			.replace(OSC_COLOR_RESPONSE, "")
			.replace(DA_RESPONSE, "")
			.replace(CPR_RESPONSE, "")
			.replace(PARTIAL_OSC_COLOR, "");
	},
};
