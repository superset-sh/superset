import { describe, expect, it } from "bun:test";
import {
	bindingsEqual,
	defaultModeForChord,
	parseBinding,
	serializeBinding,
} from "./binding";

describe("defaultModeForChord", () => {
	it("classifies named keys as 'named'", () => {
		expect(defaultModeForChord("meta+enter")).toBe("named");
		expect(defaultModeForChord("ctrl+arrowup")).toBe("named");
		expect(defaultModeForChord("alt+up")).toBe("named");
		expect(defaultModeForChord("escape")).toBe("named");
		expect(defaultModeForChord("backspace")).toBe("named");
	});

	it("classifies F-keys as 'named'", () => {
		expect(defaultModeForChord("f1")).toBe("named");
		expect(defaultModeForChord("meta+f10")).toBe("named");
		expect(defaultModeForChord("f12")).toBe("named");
	});

	it("classifies letters/digits/punctuation as 'physical'", () => {
		expect(defaultModeForChord("meta+p")).toBe("physical");
		expect(defaultModeForChord("ctrl+shift+1")).toBe("physical");
		expect(defaultModeForChord("meta+slash")).toBe("physical");
		expect(defaultModeForChord("ctrl+bracketleft")).toBe("physical");
	});
});

describe("parseBinding", () => {
	it("treats legacy string as physical for printable keys", () => {
		expect(parseBinding("meta+p")).toEqual({
			mode: "physical",
			chord: "meta+p",
		});
	});

	it("treats legacy string as named for special keys", () => {
		expect(parseBinding("meta+enter")).toEqual({
			mode: "named",
			chord: "meta+enter",
		});
		expect(parseBinding("f5")).toEqual({ mode: "named", chord: "f5" });
	});

	it("preserves explicit v2 object form", () => {
		expect(
			parseBinding({ version: 2, mode: "logical", chord: "meta+p" }),
		).toEqual({ mode: "logical", chord: "meta+p" });
		expect(
			parseBinding({ version: 2, mode: "physical", chord: "meta+p" }),
		).toEqual({ mode: "physical", chord: "meta+p" });
	});
});

describe("serializeBinding", () => {
	it("compacts physical mode to bare string (matches legacy storage)", () => {
		expect(serializeBinding({ mode: "physical", chord: "meta+p" })).toBe(
			"meta+p",
		);
	});

	it("encodes logical mode as v2 object", () => {
		expect(serializeBinding({ mode: "logical", chord: "meta+p" })).toEqual({
			version: 2,
			mode: "logical",
			chord: "meta+p",
		});
	});

	it("encodes named mode as v2 object", () => {
		expect(serializeBinding({ mode: "named", chord: "meta+enter" })).toEqual({
			version: 2,
			mode: "named",
			chord: "meta+enter",
		});
	});

	it("canonicalizes the chord on serialize", () => {
		expect(serializeBinding({ mode: "physical", chord: "shift+ctrl+k" })).toBe(
			"ctrl+shift+k",
		);
	});

	it("round-trips legacy physical bindings unchanged", () => {
		const legacy: string = "meta+shift+p";
		const round = serializeBinding(parseBinding(legacy));
		expect(round).toBe(legacy);
	});

	it("round-trips logical bindings as v2 objects", () => {
		const v2 = {
			version: 2 as const,
			mode: "logical" as const,
			chord: "meta+p",
		};
		const round = serializeBinding(parseBinding(v2));
		expect(round).toEqual(v2);
	});
});

describe("bindingsEqual", () => {
	it("nulls match nulls", () => {
		expect(bindingsEqual(null, null)).toBe(true);
		expect(bindingsEqual(null, "meta+p")).toBe(false);
		expect(bindingsEqual("meta+p", null)).toBe(false);
	});

	it("legacy string matches itself across modifier reorderings", () => {
		expect(bindingsEqual("meta+shift+p", "shift+meta+p")).toBe(true);
	});

	it("legacy physical does NOT equal explicit logical with same chord", () => {
		expect(
			bindingsEqual("meta+p", { version: 2, mode: "logical", chord: "meta+p" }),
		).toBe(false);
	});

	it("legacy physical equals explicit physical with same chord", () => {
		expect(
			bindingsEqual("meta+p", {
				version: 2,
				mode: "physical",
				chord: "meta+p",
			}),
		).toBe(true);
	});

	it("two logical bindings with equivalent chords match", () => {
		expect(
			bindingsEqual(
				{ version: 2, mode: "logical", chord: "shift+meta+p" },
				{ version: 2, mode: "logical", chord: "meta+shift+p" },
			),
		).toBe(true);
	});
});
