import { describe, expect, test } from "bun:test";
import { parseIPv4Hex, parseIPv6Hex, parseProcNetLine } from "./procfs";

describe("parseIPv4Hex", () => {
	test("decodes little-endian hex to dotted quad", () => {
		expect(parseIPv4Hex("0100007F")).toBe("127.0.0.1");
		expect(parseIPv4Hex("00000000")).toBe("0.0.0.0");
		expect(parseIPv4Hex("0101A8C0")).toBe("192.168.1.1");
	});

	test("rejects wrong-length input", () => {
		expect(parseIPv4Hex("")).toBe(null);
		expect(parseIPv4Hex("FF")).toBe(null);
		expect(parseIPv4Hex("0100007F00")).toBe(null);
	});
});

describe("parseIPv6Hex", () => {
	test("decodes all-zeros wildcard", () => {
		expect(parseIPv6Hex("00000000000000000000000000000000")).toBe(
			"0:0:0:0:0:0:0:0",
		);
	});

	test("decodes loopback :: 1", () => {
		// ::1 in /proc/net/tcp6 is four little-endian 32-bit words:
		// word0=0, word1=0, word2=0, word3=0x01000000 (LE of 0x00000001)
		expect(parseIPv6Hex("00000000000000000000000001000000")).toBe(
			"0:0:0:0:0:0:0:1",
		);
	});

	test("rejects wrong-length input", () => {
		expect(parseIPv6Hex("")).toBe(null);
		expect(parseIPv6Hex("FFFF")).toBe(null);
	});
});

describe("parseProcNetLine", () => {
	// Columns: sl local_addr remote_addr state tx_q rx_q tr tm_when retrnsmt uid timeout inode ...
	const LISTEN_LINE =
		"   0: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 145678 1 0000000000000000 100 0 0 10 0";

	test("returns port/inode/address for a LISTEN row", () => {
		const parsed = parseProcNetLine(LISTEN_LINE, false);
		expect(parsed).toEqual({
			// 0x0BB8 = 3000
			port: 3000,
			inode: 145678,
			address: "0.0.0.0",
		});
	});

	test("drops ESTABLISHED rows (state 01)", () => {
		const established = LISTEN_LINE.replace(" 0A ", " 01 ");
		expect(parseProcNetLine(established, false)).toBe(null);
	});

	test("drops rows with non-positive inode (connected but ownerless)", () => {
		const noInode = LISTEN_LINE.replace(" 145678 ", "      0 ");
		expect(parseProcNetLine(noInode, false)).toBe(null);
	});

	test("drops malformed lines", () => {
		expect(parseProcNetLine("garbage", false)).toBe(null);
		expect(parseProcNetLine("  sl  local_address ...", false)).toBe(null);
	});

	test("parses IPv6 addresses when isIPv6=true", () => {
		const ipv6Line =
			"   0: 00000000000000000000000000000000:0BB8 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 987654 1 0000000000000000 100 0 0 10 0";
		const parsed = parseProcNetLine(ipv6Line, true);
		expect(parsed).toEqual({
			port: 3000,
			inode: 987654,
			address: "0:0:0:0:0:0:0:0",
		});
	});

	test("filters out-of-range ports", () => {
		// 0x0000 = 0 (invalid)
		const badPort = LISTEN_LINE.replace(":0BB8 ", ":0000 ");
		expect(parseProcNetLine(badPort, false)).toBe(null);
	});
});
