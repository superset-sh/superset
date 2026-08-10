/** URL scheme a port is served over. */
export type PortScheme = "http" | "https";

const PORT_SCHEMES: PortScheme[] = ["http", "https"];

function isPortScheme(value: unknown): value is PortScheme {
	return PORT_SCHEMES.some((scheme) => scheme === value);
}

export interface StaticPortLabel {
	port: number;
	label: string;
	/**
	 * Scheme the browser actions open this port with. Always set once parsed —
	 * an entry that omits it means `http`.
	 */
	scheme: PortScheme;
}

export type StaticPortsParseResult =
	| { ports: StaticPortLabel[]; error: null }
	| { ports: null; error: string };

function validatePortEntry(
	entry: unknown,
	index: number,
):
	| { valid: true; port: number; label: string; scheme: PortScheme }
	| { valid: false; error: string } {
	if (typeof entry !== "object" || entry === null) {
		return { valid: false, error: `ports[${index}] must be an object` };
	}

	if (!("port" in entry)) {
		return {
			valid: false,
			error: `ports[${index}] is missing required field 'port'`,
		};
	}

	if (!("label" in entry)) {
		return {
			valid: false,
			error: `ports[${index}] is missing required field 'label'`,
		};
	}

	const { port, label, scheme } = entry as {
		port: unknown;
		label: unknown;
		scheme: unknown;
	};

	if (typeof port !== "number" || !Number.isInteger(port)) {
		return { valid: false, error: `ports[${index}].port must be an integer` };
	}

	if (port < 1 || port > 65535) {
		return {
			valid: false,
			error: `ports[${index}].port must be between 1 and 65535`,
		};
	}

	if (typeof label !== "string") {
		return { valid: false, error: `ports[${index}].label must be a string` };
	}

	if (label.trim() === "") {
		return { valid: false, error: `ports[${index}].label cannot be empty` };
	}

	// Optional: a dev server that only speaks TLS is declared `"scheme": "https"`, so the
	// browser actions open it over https instead of failing in the TLS handshake.
	if (scheme !== undefined && !isPortScheme(scheme)) {
		return {
			valid: false,
			error: `ports[${index}].scheme must be "http" or "https"`,
		};
	}

	return {
		valid: true,
		port,
		label: label.trim(),
		scheme: scheme === undefined ? "http" : scheme,
	};
}

export function parseStaticPortsConfig(
	content: string,
): StaticPortsParseResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ports: null, error: `Invalid JSON in ports.json: ${message}` };
	}

	if (typeof parsed !== "object" || parsed === null) {
		return { ports: null, error: "ports.json must contain a JSON object" };
	}

	if (!("ports" in parsed)) {
		return {
			ports: null,
			error: "ports.json is missing required field 'ports'",
		};
	}

	const portsField = (parsed as { ports: unknown }).ports;
	if (!Array.isArray(portsField)) {
		return { ports: null, error: "'ports' field must be an array" };
	}

	const ports: StaticPortLabel[] = [];
	const seenPorts = new Set<number>();
	for (let index = 0; index < portsField.length; index++) {
		const result = validatePortEntry(portsField[index], index);
		if (!result.valid) {
			return { ports: null, error: result.error };
		}
		if (seenPorts.has(result.port)) {
			return {
				ports: null,
				error: `ports[${index}].port duplicates an earlier entry`,
			};
		}
		seenPorts.add(result.port);
		ports.push({
			port: result.port,
			label: result.label,
			scheme: result.scheme,
		});
	}

	return { ports, error: null };
}
