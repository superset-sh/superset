import { describe, expect, it } from "bun:test";
import { builtInThemes, darkTheme, lightTheme } from "./built-in";
import {
	GRAPH_LANE_COUNT,
	GRAPH_LANE_CSS_VARS,
	getGraphLanes,
} from "./graph-lanes";
import type { Theme } from "./types";

describe("getGraphLanes", () => {
	it("gives every built-in theme eight distinct lane colors", () => {
		for (const theme of builtInThemes) {
			const lanes = getGraphLanes(theme);
			expect(lanes).toHaveLength(GRAPH_LANE_COUNT);
			expect(lanes.every(Boolean)).toBe(true);
			expect(new Set(lanes).size).toBe(GRAPH_LANE_COUNT);
		}
	});

	it("still yields eight lanes when a theme has no terminal block", () => {
		const stripped: Theme = { ...darkTheme, terminal: undefined };
		const lanes = getGraphLanes(stripped);
		expect(lanes.every(Boolean)).toBe(true);
		expect(new Set(lanes).size).toBe(GRAPH_LANE_COUNT);
	});

	it("keeps eight lanes distinct when a theme sets bright == standard", () => {
		// Monokai does exactly this, so slots 7-8 cannot be the other brightness.
		const monokai = builtInThemes.find((theme) => theme.id === "monokai");
		expect(monokai?.terminal?.brightBlue).toBe(
			monokai?.terminal?.blue as string,
		);
		expect(new Set(getGraphLanes(monokai as Theme)).size).toBe(
			GRAPH_LANE_COUNT,
		);
	});

	it("draws dark themes from the bright set and light themes from the standard set", () => {
		expect(getGraphLanes(darkTheme)[0]).toBe(
			darkTheme.terminal?.brightBlue as string,
		);
		expect(getGraphLanes(lightTheme)[0]).toBe(
			lightTheme.terminal?.blue as string,
		);
	});

	it("lightens dark-theme overflow lanes toward white, darkens light-theme ones toward black", () => {
		// Slots 7/8 are lightness-shifted copies of the first two hues — the only
		// rendering path the live app had never exercised before §5.3. The
		// direction matters: a dark ground needs the lane brightened (toward
		// white), a light ground needs it darkened (toward black), or a tinted row
		// reads the wrong way. Pin both directions and the wrap-around identity.
		const dark = getGraphLanes(darkTheme);
		const light = getGraphLanes(lightTheme);
		expect(dark[6]).toBe(
			`color-mix(in oklch, ${darkTheme.terminal?.brightBlue} 62%, white)`,
		);
		expect(dark[7]).toBe(
			`color-mix(in oklch, ${darkTheme.terminal?.brightGreen} 62%, white)`,
		);
		expect(light[6]).toBe(
			`color-mix(in oklch, ${lightTheme.terminal?.blue} 62%, black)`,
		);
		expect(light[7]).toBe(
			`color-mix(in oklch, ${lightTheme.terminal?.green} 62%, black)`,
		);
		// Slots 7/8 stay distinct from 1–6 and from each other in both themes —
		// the wrap-around never collapses two live lanes onto one colour.
		for (const lanes of [dark, light]) {
			expect(new Set(lanes).size).toBe(GRAPH_LANE_COUNT);
			expect(lanes[6]).not.toBe(lanes[0]);
			expect(lanes[7]).not.toBe(lanes[1]);
			expect(lanes[6]).not.toBe(lanes[7]);
		}
	});

	it("names one CSS variable per lane, 1-indexed", () => {
		expect(GRAPH_LANE_CSS_VARS).toHaveLength(GRAPH_LANE_COUNT);
		expect(GRAPH_LANE_CSS_VARS[0]).toBe("--graph-lane-1");
		expect(GRAPH_LANE_CSS_VARS.at(-1)).toBe(`--graph-lane-${GRAPH_LANE_COUNT}`);
	});
});
