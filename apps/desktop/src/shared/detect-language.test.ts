import { describe, expect, it } from "bun:test";
import { detectLanguage } from "./detect-language";

describe("detectLanguage", () => {
	// Regression: extensionless files recognized by their full name (Dockerfile,
	// Makefile) lost all syntax highlighting because detectLanguage split the
	// entire path on "." and looked the last segment up in the map. Every caller
	// passes a full path (e.g. "/repo/Dockerfile"), so the map key became
	// "/repo/dockerfile" — never matching the "dockerfile"/"makefile" entries.
	// Tracker: #5595 (file viewer, editor & markdown issues).
	it("detects Dockerfile by name even when given a full path", () => {
		expect(detectLanguage("Dockerfile")).toBe("dockerfile");
		expect(detectLanguage("/repo/Dockerfile")).toBe("dockerfile");
		expect(detectLanguage("services/api/Dockerfile")).toBe("dockerfile");
	});

	it("detects Makefile by name even when given a full path", () => {
		expect(detectLanguage("Makefile")).toBe("makefile");
		expect(detectLanguage("/repo/src/Makefile")).toBe("makefile");
	});

	it("still resolves extensions from a full path", () => {
		expect(detectLanguage("/repo/src/app.ts")).toBe("typescript");
		expect(detectLanguage("docs/README.md")).toBe("markdown");
		expect(detectLanguage("/home/me/main.py")).toBe("python");
	});

	it("resolves extensions for files under directories whose names contain dots", () => {
		expect(detectLanguage("com.example.app/index.ts")).toBe("typescript");
		expect(detectLanguage("v1.2.3/notes.md")).toBe("markdown");
	});

	it("falls back to plaintext for unknown or extensionless files", () => {
		expect(detectLanguage("/repo/LICENSE")).toBe("plaintext");
		expect(detectLanguage("/repo/data.unknownext")).toBe("plaintext");
	});
});
