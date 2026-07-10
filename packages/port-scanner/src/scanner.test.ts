import { describe, expect, it } from "bun:test";

/**
 * Tests for lsof output parsing logic.
 *
 * The lsof output format is:
 * COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
 * Example: node 12345 user 23u IPv4 0x1234 0t0 TCP *:3000 (LISTEN)
 *
 * The NAME column (e.g., "*:3000") is the second-to-last column,
 * with "(LISTEN)" being the last column.
 */

interface PortInfo {
	port: number;
	pid: number;
	address: string;
	processName: string;
}

/**
 * Parse lsof output to extract port information.
 * Extracted from getListeningPortsLsof for testability.
 *
 * @param output - Raw lsof output
 * @param allowedPids - Set of PIDs to filter by. If provided, only ports from these PIDs are returned.
 *                      This is critical because lsof ignores -p filter when PIDs don't exist,
 *                      returning ALL listening ports instead.
 */
function parseLsofOutput(
	output: string,
	allowedPids?: Set<number>,
): PortInfo[] {
	if (!output.trim()) return [];

	const ports: PortInfo[] = [];
	const lines = output.trim().split("\n").slice(1); // Skip header

	for (const line of lines) {
		if (!line.trim()) continue;

		// Format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME (LISTEN)
		// Example: node 12345 user 23u IPv4 0x1234 0t0 TCP *:3000 (LISTEN)
		const columns = line.split(/\s+/);
		if (columns.length < 10) continue;

		const processName = columns[0];
		const pidStr = columns[1];
		const name = columns[columns.length - 2]; // NAME column (e.g., *:3000), before (LISTEN)
		if (
			processName === undefined ||
			pidStr === undefined ||
			name === undefined
		) {
			continue;
		}

		const pid = Number.parseInt(pidStr, 10);

		// Filter by allowed PIDs if provided
		// This guards against lsof returning all ports when -p filter is ignored
		if (allowedPids && !allowedPids.has(pid)) continue;

		// Parse address:port from NAME column
		// Formats: *:3000, 127.0.0.1:3000, [::1]:3000, [::]:3000
		const match = name.match(/^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/);
		if (match) {
			const address = match[1] || match[2] || "*";
			const portStr = match[3];
			if (portStr === undefined) continue;
			const port = Number.parseInt(portStr, 10);

			// Skip invalid ports
			if (port < 1 || port > 65535) continue;

			ports.push({
				port,
				pid,
				address: address === "*" ? "0.0.0.0" : address,
				processName,
			});
		}
	}

	return ports;
}

describe("port-scanner", () => {
	describe("parseLsofOutput", () => {
		it("should parse standard lsof output with (LISTEN) suffix", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   23u  IPv4 0x1234567890ab      0t0  TCP *:3000 (LISTEN)`;

			const ports = parseLsofOutput(output);

			expect(ports).toHaveLength(1);
			expect(ports[0]).toEqual({
				port: 3000,
				pid: 12345,
				address: "0.0.0.0",
				processName: "node",
			});
		});

		it("should parse localhost address", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   23u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:8080 (LISTEN)`;

			const ports = parseLsofOutput(output);

			expect(ports).toHaveLength(1);
			expect(ports[0]).toEqual({
				port: 8080,
				pid: 12345,
				address: "127.0.0.1",
				processName: "node",
			});
		});

		it("should parse IPv6 addresses", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   23u  IPv6 0x1234567890ab      0t0  TCP [::1]:3000 (LISTEN)`;

			const ports = parseLsofOutput(output);

			expect(ports).toHaveLength(1);
			expect(ports[0]).toEqual({
				port: 3000,
				pid: 12345,
				address: "::1",
				processName: "node",
			});
		});

		it("should parse IPv6 wildcard addresses", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   23u  IPv6 0x1234567890ab      0t0  TCP [::]:8000 (LISTEN)`;

			const ports = parseLsofOutput(output);

			expect(ports).toHaveLength(1);
			expect(ports[0]).toEqual({
				port: 8000,
				pid: 12345,
				address: "::",
				processName: "node",
			});
		});

		it("should parse multiple ports", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   23u  IPv4 0x1234567890ab      0t0  TCP *:3000 (LISTEN)
node      12345   user   24u  IPv4 0x1234567890ac      0t0  TCP *:3001 (LISTEN)
python    67890   user   5u   IPv4 0x1234567890ad      0t0  TCP 127.0.0.1:8000 (LISTEN)`;

			const ports = parseLsofOutput(output);

			expect(ports).toHaveLength(3);
			expect(ports[0]).toEqual({
				port: 3000,
				pid: 12345,
				address: "0.0.0.0",
				processName: "node",
			});
			expect(ports[1]).toEqual({
				port: 3001,
				pid: 12345,
				address: "0.0.0.0",
				processName: "node",
			});
			expect(ports[2]).toEqual({
				port: 8000,
				pid: 67890,
				address: "127.0.0.1",
				processName: "python",
			});
		});

		it("should handle empty output", () => {
			const ports = parseLsofOutput("");
			expect(ports).toHaveLength(0);
		});

		it("should handle header-only output", () => {
			const output =
				"COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME";
			const ports = parseLsofOutput(output);
			expect(ports).toHaveLength(0);
		});

		it("should skip lines with insufficient columns", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   23u  IPv4 0x1234567890ab      0t0  TCP *:3000 (LISTEN)
short line
node      67890   user   24u  IPv4 0x1234567890ac      0t0  TCP *:4000 (LISTEN)`;

			const ports = parseLsofOutput(output);

			expect(ports).toHaveLength(2);
			expect(ports[0]?.port).toBe(3000);
			expect(ports[1]?.port).toBe(4000);
		});

		it("should skip invalid port numbers", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   23u  IPv4 0x1234567890ab      0t0  TCP *:0 (LISTEN)
node      12345   user   24u  IPv4 0x1234567890ac      0t0  TCP *:70000 (LISTEN)
node      12345   user   25u  IPv4 0x1234567890ad      0t0  TCP *:3000 (LISTEN)`;

			const ports = parseLsofOutput(output);

			expect(ports).toHaveLength(1);
			expect(ports[0]?.port).toBe(3000);
		});

		it("should handle real-world lsof output format", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF                NODE NAME
rapportd    947 kietho    8u  IPv4 0x9e27f4f0c86f6338      0t0                 TCP *:59251 (LISTEN)
ControlCe  1020 kietho    8u  IPv4 0xe6bd39002aa591ca      0t0                 TCP *:7000 (LISTEN)
postgres   3457 kietho    8u  IPv4 0xb4db4c0cd4dfeb63      0t0                 TCP 127.0.0.1:5432 (LISTEN)`;

			const ports = parseLsofOutput(output);

			expect(ports).toHaveLength(3);
			expect(ports[0]).toEqual({
				port: 59251,
				pid: 947,
				address: "0.0.0.0",
				processName: "rapportd",
			});
			expect(ports[1]).toEqual({
				port: 7000,
				pid: 1020,
				address: "0.0.0.0",
				processName: "ControlCe",
			});
			expect(ports[2]).toEqual({
				port: 5432,
				pid: 3457,
				address: "127.0.0.1",
				processName: "postgres",
			});
		});

		it("should not parse (LISTEN) as the port name", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   23u  IPv4 0x1234567890ab      0t0  TCP *:3000 (LISTEN)`;

			const ports = parseLsofOutput(output);

			expect(ports).toHaveLength(1);
			expect(ports[0]?.port).toBe(3000);
			expect(ports[0]?.address).toBe("0.0.0.0");
		});

		it("should handle process names with different lengths", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
n         12345   user   23u  IPv4 0x1234567890ab      0t0  TCP *:3000 (LISTEN)
verylongprocessname 67890   user   24u  IPv4 0x1234567890ac      0t0  TCP *:4000 (LISTEN)`;

			const ports = parseLsofOutput(output);

			expect(ports).toHaveLength(2);
			expect(ports[0]?.processName).toBe("n");
			expect(ports[0]?.port).toBe(3000);
			expect(ports[1]?.processName).toBe("verylongprocessname");
			expect(ports[1]?.port).toBe(4000);
		});
	});

	describe("parseLsofOutput with PID filtering", () => {
		it("should filter ports by allowed PIDs", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   23u  IPv4 0x1234567890ab      0t0  TCP *:3000 (LISTEN)
python    67890   user   5u   IPv4 0x1234567890ad      0t0  TCP *:8000 (LISTEN)
ruby      99999   user   6u   IPv4 0x1234567890ae      0t0  TCP *:9000 (LISTEN)`;

			const allowedPids = new Set([12345, 99999]);
			const ports = parseLsofOutput(output, allowedPids);

			expect(ports).toHaveLength(2);
			expect(ports[0]?.pid).toBe(12345);
			expect(ports[0]?.port).toBe(3000);
			expect(ports[1]?.pid).toBe(99999);
			expect(ports[1]?.port).toBe(9000);
		});

		it("should return empty when no PIDs match", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   23u  IPv4 0x1234567890ab      0t0  TCP *:3000 (LISTEN)
python    67890   user   5u   IPv4 0x1234567890ad      0t0  TCP *:8000 (LISTEN)`;

			const allowedPids = new Set([11111, 22222]);
			const ports = parseLsofOutput(output, allowedPids);

			expect(ports).toHaveLength(0);
		});

		it("should return all ports when allowedPids is not provided", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   23u  IPv4 0x1234567890ab      0t0  TCP *:3000 (LISTEN)
python    67890   user   5u   IPv4 0x1234567890ad      0t0  TCP *:8000 (LISTEN)`;

			const ports = parseLsofOutput(output);

			expect(ports).toHaveLength(2);
		});

		it("should handle lsof returning unrelated ports when -p filter fails", () => {
			const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF                NODE NAME
rapportd    947 kietho    8u  IPv4 0x9e27f4f0c86f6338      0t0                 TCP *:59251 (LISTEN)
ControlCe  1020 kietho    8u  IPv4 0xe6bd39002aa591ca      0t0                 TCP *:7000 (LISTEN)
postgres   3457 kietho    8u  IPv4 0xb4db4c0cd4dfeb63      0t0                 TCP 127.0.0.1:5432 (LISTEN)
node      12345 kietho   23u  IPv4 0x1234567890ab          0t0                 TCP *:3000 (LISTEN)`;

			const allowedPids = new Set([12345]);
			const ports = parseLsofOutput(output, allowedPids);

			expect(ports).toHaveLength(1);
			expect(ports[0]?.port).toBe(3000);
			expect(ports[0]?.pid).toBe(12345);
		});
	});
});
