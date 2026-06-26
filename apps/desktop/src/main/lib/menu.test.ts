import { describe, expect, it } from "bun:test";
import { HOTKEYS_REGISTRY } from "renderer/hotkeys/registry";
import { OPEN_REPO_ACCELERATOR } from "./menu-accelerators";

// Issue #4964: "Open Repo..." menu accelerator (Cmd/Ctrl+O) collided with
// the OPEN_IN_APP hotkey on macOS (Cmd+O), so pressing Cmd+O on Mac fired
// whichever binding the OS picked first — a coin flip between opening the
// repo picker and the IDE.

const ACCELERATOR_TO_REGISTRY_MODIFIER: Record<string, string> = {
	cmdorctrl_mac: "meta",
	cmdorctrl_windows: "ctrl",
	cmdorctrl_linux: "ctrl",
	cmd_mac: "meta",
	ctrl_mac: "ctrl",
	ctrl_windows: "ctrl",
	ctrl_linux: "ctrl",
	alt_mac: "alt",
	alt_windows: "alt",
	alt_linux: "alt",
	shift_mac: "shift",
	shift_windows: "shift",
	shift_linux: "shift",
};

function acceleratorToRegistryChord(
	accelerator: string,
	platform: "mac" | "windows" | "linux",
): string {
	return accelerator
		.toLowerCase()
		.split("+")
		.map((token) => {
			const mapped = ACCELERATOR_TO_REGISTRY_MODIFIER[`${token}_${platform}`];
			return mapped ?? token;
		})
		.join("+");
}

function registryChord(binding: unknown): string | null {
	if (binding === null || binding === undefined) return null;
	if (typeof binding === "string") return binding;
	if (typeof binding === "object" && "chord" in binding) {
		return String((binding as { chord: string }).chord);
	}
	return null;
}

describe("Open Repo menu accelerator (#4964)", () => {
	for (const platform of ["mac", "windows", "linux"] as const) {
		it(`does not collide with any registered hotkey on ${platform}`, () => {
			const expected = acceleratorToRegistryChord(
				OPEN_REPO_ACCELERATOR,
				platform,
			);
			const collisions: string[] = [];
			for (const [id, def] of Object.entries(HOTKEYS_REGISTRY)) {
				const chord = registryChord(def.key[platform]);
				if (chord && chord.toLowerCase() === expected) {
					collisions.push(id);
				}
			}
			expect({ platform, expected, collisions }).toEqual({
				platform,
				expected,
				collisions: [],
			});
		});
	}
});
