export interface RegisterOutcome {
	snapshot?:
		| {
				id: string;
				version: string;
				status: string;
				error: string | null;
		  }
		| undefined;
	warnings: string[];
}

export function describeRegisterOutcome(
	verb: string,
	{ snapshot, warnings }: RegisterOutcome,
): string {
	const lines: string[] = [];
	if (snapshot) {
		const status =
			snapshot.status === "error"
				? `error: ${snapshot.error ?? "unknown"}`
				: snapshot.status;
		lines.push(`${verb} ${snapshot.id} v${snapshot.version} (${status})`);
	} else {
		lines.push(`${verb} plugin, but it is not loaded`);
	}
	for (const warning of warnings) {
		lines.push(`warning: ${warning}`);
	}
	return lines.join("\n");
}
