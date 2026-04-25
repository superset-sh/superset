export interface StaticPortLabel {
	port: number;
	label: string;
}

export type StaticPortsParseResult =
	| { ports: StaticPortLabel[]; error: null }
	| { ports: null; error: string };

function validatePortEntry(
	entry: unknown,
	index: number,
):
	| { valid: true; port: number; label: string }
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

	const { port, label } = entry as { port: unknown; label: unknown };

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

	return { valid: true, port, label: label.trim() };
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
		ports.push({ port: result.port, label: result.label });
	}

	return { ports, error: null };
}
