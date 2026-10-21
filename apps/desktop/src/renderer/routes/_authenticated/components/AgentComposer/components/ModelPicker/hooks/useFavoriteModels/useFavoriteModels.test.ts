import { expect, test } from "bun:test";
import { toggleFavorite } from "./useFavoriteModels";

const model = (id: string, presetId = "claude") => ({
	presetId,
	id,
	label: id,
});

test("toggling adds, removes per agent, and keeps only the newest 24", () => {
	expect(toggleFavorite([model("a")], model("b"))).toEqual([
		model("a"),
		model("b"),
	]);
	expect(toggleFavorite([model("a"), model("a", "codex")], model("a"))).toEqual(
		[model("a", "codex")],
	);
	const full = Array.from({ length: 24 }, (_, index) => model(`m${index}`));
	const next = toggleFavorite(full, model("new"));
	expect(next).toHaveLength(24);
	expect(next[0]).toEqual(model("m1"));
	expect(next.at(-1)).toEqual(model("new"));
});
