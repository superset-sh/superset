import { expect, test } from "bun:test";
import {
	delimitedSource,
	guessSeparator,
	parseDelimitedText,
} from "./delimitedText";

const texts = (text: string, separator: string) =>
	parseDelimitedText(text, separator).map((row) =>
		Array.from(row, (cell) => cell?.v ?? ""),
	);

test("parses quoted fields, CRLF, trailing separators and an unclosed quote", () => {
	expect(texts('a,"b\r\nc",\r\n"x""y"z,"open\n', ",")).toEqual([
		["a", "b\r\nc", ""],
		['x"yz', "open\n"],
	]);
	expect(texts("", ",")).toEqual([]);
});

test("keeps empty fields and empty records, but not the line after the last newline", () => {
	expect(texts("a,b,\n", ",")).toEqual([["a", "b", ""]]);
	expect(texts("a,,", ",")).toEqual([["a", "", ""]]);
	expect(texts("a\n\n,\n", ",")).toEqual([["a"], [""], ["", ""]]);
});

test("guesses the separator outside quotes and honours a sep= line", () => {
	expect(guessSeparator('"a;b;c",d,e\n')).toBe(",");
	expect(guessSeparator("a;b\tc;d\n")).toBe(";");
	expect(guessSeparator("single\n")).toBe(",");
	expect(delimitedSource("sep=|\r\na|b", null)).toEqual({
		text: "a|b",
		separator: "|",
	});
	expect(delimitedSource("sep=;\na,b\n1,2\n", null).separator).toBe(";");
	expect(delimitedSource("a,b\tc", "\t").separator).toBe("\t");
});

test("picks the separator that splits every record into the same number of fields", () => {
	expect(guessSeparator("name,note\nJoe,a;b;c\nAna,d;e;f\n")).toBe(",");
	expect(guessSeparator("Mois;CA\nJan;5200,50\nFév;7,5\n")).toBe(";");
	expect(guessSeparator('id|label\n1|"x|y"\n2|z\n')).toBe("|");
});
