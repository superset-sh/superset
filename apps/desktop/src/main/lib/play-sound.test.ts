import { describe, expect, test } from "bun:test";
import { getPlayCommands } from "./play-sound";

const MP3_INCOMPATIBLE = new Set(["paplay", "aplay"]);

describe("getPlayCommands on Linux", () => {
	test("does not try paplay or aplay first for an MP3 file", () => {
		// Reproduces #4899: paplay/aplay can only decode PCM/WAV. Passing an
		// MP3 either errors out or — in aplay's case — plays the compressed
		// bytes as raw PCM, producing static noise.
		const commands = getPlayCommands(
			"linux",
			"/resources/sounds/ping.mp3",
			100,
		);

		expect(commands.length).toBeGreaterThan(0);
		expect(MP3_INCOMPATIBLE.has(commands[0].command)).toBe(false);
	});

	test("tries an MP3-capable decoder before paplay/aplay", () => {
		const commands = getPlayCommands(
			"linux",
			"/resources/sounds/ping.mp3",
			100,
		);
		const mp3CapablePlayers = new Set(["mpg123", "ffplay", "mpv"]);

		const firstMp3CapableIndex = commands.findIndex((c) =>
			mp3CapablePlayers.has(c.command),
		);
		const firstWavOnlyIndex = commands.findIndex((c) =>
			MP3_INCOMPATIBLE.has(c.command),
		);

		expect(firstMp3CapableIndex).toBeGreaterThanOrEqual(0);
		if (firstWavOnlyIndex !== -1) {
			expect(firstMp3CapableIndex).toBeLessThan(firstWavOnlyIndex);
		}
	});

	test("passes volume to MP3-capable players", () => {
		const commands = getPlayCommands("linux", "/resources/sounds/ping.mp3", 50);
		const mpg123 = commands.find((c) => c.command === "mpg123");
		const ffplay = commands.find((c) => c.command === "ffplay");

		expect(mpg123).toBeDefined();
		// mpg123 -f takes a scale factor 0..32768; 50% -> 16384
		expect(mpg123?.args).toContain("-f");
		expect(mpg123?.args).toContain("16384");

		expect(ffplay).toBeDefined();
		// ffplay -volume takes a 0..100 integer
		expect(ffplay?.args).toContain("-volume");
		expect(ffplay?.args).toContain("50");
	});

	test("clamps volume into the valid range", () => {
		const lowVol = getPlayCommands("linux", "/x.mp3", -10);
		const lowMpg = lowVol.find((c) => c.command === "mpg123");
		expect(lowMpg?.args).toContain("0");

		const highVol = getPlayCommands("linux", "/x.mp3", 500);
		const highMpg = highVol.find((c) => c.command === "mpg123");
		expect(highMpg?.args).toContain("32768");
	});

	test("includes the requested sound path as the last argument of every command", () => {
		const path = "/resources/sounds/ping.mp3";
		const commands = getPlayCommands("linux", path, 100);
		for (const cmd of commands) {
			expect(cmd.args[cmd.args.length - 1]).toBe(path);
		}
	});
});

describe("getPlayCommands on macOS", () => {
	test("uses afplay with volume", () => {
		const commands = getPlayCommands("darwin", "/x.mp3", 75);
		expect(commands).toHaveLength(1);
		expect(commands[0].command).toBe("afplay");
		expect(commands[0].args).toContain("-v");
		expect(commands[0].args).toContain("0.75");
		expect(commands[0].args).toContain("/x.mp3");
	});
});
