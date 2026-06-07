import { describe, expect, test } from "bun:test";
import { detectLanguage } from "./detect-language";

describe("detectLanguage", () => {
	test("maps known extensions to languages", () => {
		expect(detectLanguage("index.ts")).toBe("typescript");
		expect(detectLanguage("styles.css")).toBe("css");
		expect(detectLanguage("config.toml")).toBe("toml");
		expect(detectLanguage("unknown.xyz")).toBe("plaintext");
	});

	// Reproduces #5173 — `.env` files render as plaintext (no syntax highlighting).
	test("detects .env files", () => {
		expect(detectLanguage(".env")).toBe("properties");
		expect(detectLanguage("/path/to/.env")).toBe("properties");
	});

	test("detects .env variants", () => {
		expect(detectLanguage(".env.local")).toBe("properties");
		expect(detectLanguage(".env.production")).toBe("properties");
		expect(detectLanguage("/repo/apps/web/.env.development")).toBe(
			"properties",
		);
	});
});
