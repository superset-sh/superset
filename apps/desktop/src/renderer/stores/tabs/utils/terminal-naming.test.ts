import { describe, expect, it } from "bun:test";
import {
	DefaultTerminalNamingStrategy,
	generateTerminalName,
	type TerminalNamingStrategy,
} from "./terminal-naming";

describe("DefaultTerminalNamingStrategy", () => {
	it("should return base name when no collision", () => {
		const strategy = new DefaultTerminalNamingStrategy();
		const result = strategy.generateName([]);
		expect(result).toBe("Terminal");
	});

	it("should return base name when no collision with other names", () => {
		const strategy = new DefaultTerminalNamingStrategy();
		const result = strategy.generateName(["Other Name", "Another Terminal"]);
		expect(result).toBe("Terminal");
	});

	it("should return Terminal (1) when base name exists", () => {
		const strategy = new DefaultTerminalNamingStrategy();
		const result = strategy.generateName(["Terminal"]);
		expect(result).toBe("Terminal (1)");
	});

	it("should increment number on multiple collisions", () => {
		const strategy = new DefaultTerminalNamingStrategy();
		const result = strategy.generateName([
			"Terminal",
			"Terminal (1)",
			"Terminal (2)",
		]);
		expect(result).toBe("Terminal (3)");
	});

	it("should find gaps in numbering", () => {
		const strategy = new DefaultTerminalNamingStrategy();
		const result = strategy.generateName(["Terminal", "Terminal (2)"]);
		expect(result).toBe("Terminal (1)");
	});

	it("should handle non-sequential numbers", () => {
		const strategy = new DefaultTerminalNamingStrategy();
		const result = strategy.generateName([
			"Terminal",
			"Terminal (5)",
			"Terminal (10)",
		]);
		expect(result).toBe("Terminal (1)");
	});

	it("should handle custom base name", () => {
		const strategy = new DefaultTerminalNamingStrategy("Shell");
		const result = strategy.generateName([]);
		expect(result).toBe("Shell");
	});

	it("should handle custom base name with collision", () => {
		const strategy = new DefaultTerminalNamingStrategy("Shell");
		const result = strategy.generateName(["Shell", "Shell (1)"]);
		expect(result).toBe("Shell (2)");
	});

	it("should handle large numbers of terminals", () => {
		const strategy = new DefaultTerminalNamingStrategy();
		const existingNames = [
			"Terminal",
			...Array.from({ length: 100 }, (_, i) => `Terminal (${i + 1})`),
		];
		const result = strategy.generateName(existingNames);
		expect(result).toBe("Terminal (101)");
	});

	it("should not be affected by similar named terminals", () => {
		const strategy = new DefaultTerminalNamingStrategy();
		const result = strategy.generateName([
			"Terminal Window",
			"My Terminal",
			"Terminal (x)",
		]);
		expect(result).toBe("Terminal");
	});
});

describe("generateTerminalName helper", () => {
	it("should use default strategy when no strategy provided", () => {
		const result = generateTerminalName([]);
		expect(result).toBe("Terminal");
	});

	it("should use default strategy with collisions", () => {
		const result = generateTerminalName(["Terminal", "Terminal (1)"]);
		expect(result).toBe("Terminal (2)");
	});

	it("should accept custom strategy", () => {
		class CustomStrategy implements TerminalNamingStrategy {
			generateName(_existingNames: string[]): string {
				return "Custom Terminal";
			}
		}

		const result = generateTerminalName(["Terminal"], new CustomStrategy());
		expect(result).toBe("Custom Terminal");
	});
});

describe("Terminal naming in realistic scenarios", () => {
	it("should generate sequential names for multiple new terminals", () => {
		const strategy = new DefaultTerminalNamingStrategy();
		const existingNames: string[] = [];

		const name1 = strategy.generateName(existingNames);
		expect(name1).toBe("Terminal");
		existingNames.push(name1);

		const name2 = strategy.generateName(existingNames);
		expect(name2).toBe("Terminal (1)");
		existingNames.push(name2);

		const name3 = strategy.generateName(existingNames);
		expect(name3).toBe("Terminal (2)");
		existingNames.push(name3);

		expect(existingNames).toEqual(["Terminal", "Terminal (1)", "Terminal (2)"]);
	});

	it("should reuse numbers after terminal is closed", () => {
		const strategy = new DefaultTerminalNamingStrategy();
		let existingNames = ["Terminal", "Terminal (1)", "Terminal (2)"];

		// Close Terminal (1)
		existingNames = existingNames.filter((name) => name !== "Terminal (1)");

		const newName = strategy.generateName(existingNames);
		expect(newName).toBe("Terminal (1)");
	});

	it("should handle mixed terminal types", () => {
		const strategy = new DefaultTerminalNamingStrategy();
		const existingNames = [
			"Terminal",
			"New Split View",
			"Terminal (1)",
			"Another Tab",
		];

		const result = strategy.generateName(existingNames);
		expect(result).toBe("Terminal (2)");
	});
});
