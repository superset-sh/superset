import { describe, expect, it } from "bun:test";
import type { ProcessedBuilderConfig } from "./option";
import { parseArgv } from "./parser";

const stringOption = (name: string): ProcessedBuilderConfig => ({
	name,
	type: "string",
	aliases: [],
});

describe("parseArgv", () => {
	it("accepts the conventional stdin sentinel as a string option value", () => {
		const result = parseArgv(["bun", "superset", "--file", "-"], {
			file: stringOption("file"),
		});

		expect(result.options.file).toBe("-");
	});

	it("does not consume another option as a string value", () => {
		expect(() =>
			parseArgv(["bun", "superset", "--file", "--other"], {
				file: stringOption("file"),
				other: stringOption("other"),
			}),
		).toThrow("Option --file requires a value");
	});
});
