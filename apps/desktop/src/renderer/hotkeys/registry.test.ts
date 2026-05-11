import { describe, expect, it } from "bun:test";
import { HOTKEYS_REGISTRY } from "./registry";

// Locks in the shape of shipped defaults: every binding is a bare chord
// string (or null), all lower-case, joined by "+". The dispatch model is
// event.code by default, with a runtime "Match by typed character" toggle —
// neither needs metadata on the binding itself.

function* allBindings(): Generator<{
	id: string;
	platform: "mac" | "windows" | "linux";
	binding: unknown;
}> {
	for (const [id, def] of Object.entries(HOTKEYS_REGISTRY)) {
		for (const platform of ["mac", "windows", "linux"] as const) {
			yield { id, platform, binding: def.key[platform] };
		}
	}
}

describe("HOTKEYS_REGISTRY shape", () => {
	it("every binding is a bare string or null (no v2 objects)", () => {
		for (const { id, platform, binding } of allBindings()) {
			if (binding === null) continue;
			expect({
				id,
				platform,
				kind: typeof binding,
			}).toEqual({ id, platform, kind: "string" });
		}
	});

	it("chord strings are lower-case and `+`-joined", () => {
		for (const { id, platform, binding } of allBindings()) {
			if (binding === null) continue;
			if (typeof binding !== "string") continue;
			expect({ id, platform, binding }).toMatchObject({
				binding: binding.toLowerCase(),
			});
			// At least one terminal token (no trailing `+`)
			expect(binding.split("+").every((p) => p.length > 0)).toBe(true);
		}
	});

	it("canary defaults use the expected platform chords", () => {
		expect(HOTKEYS_REGISTRY.QUICK_OPEN.key.mac).toBe("meta+p");
		expect(HOTKEYS_REGISTRY.JUMP_TO_WORKSPACE_1.key.mac).toBe("meta+1");
		expect(HOTKEYS_REGISTRY.OPEN_SETTINGS.key.mac).toBe("meta+comma");
		expect(HOTKEYS_REGISTRY.NEW_GROUP.key.mac).toBe("meta+t");
	});
});
