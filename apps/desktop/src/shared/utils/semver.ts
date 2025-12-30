type SemverPrereleaseId = string | number;

interface ParsedSemver {
	major: number;
	minor: number;
	patch: number;
	prerelease: SemverPrereleaseId[];
}

function parsePrereleaseIdentifier(part: string): SemverPrereleaseId {
	if (/^(0|[1-9]\d*)$/.test(part)) {
		return Number(part);
	}
	return part;
}

export function parseSemver(input: string): ParsedSemver | null {
	const version = input.trim().replace(/^v/, "");
	const match = version.match(
		/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([^+]+))?(?:\+(.+))?$/,
	);

	if (!match) return null;

	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	const prereleaseStr = match[4];

	const prerelease = prereleaseStr
		? prereleaseStr.split(".").map(parsePrereleaseIdentifier)
		: [];

	return { major, minor, patch, prerelease };
}

export function compareSemver(a: string, b: string): number | null {
	const parsedA = parseSemver(a);
	const parsedB = parseSemver(b);

	if (!parsedA || !parsedB) return null;

	if (parsedA.major !== parsedB.major) return parsedA.major - parsedB.major;
	if (parsedA.minor !== parsedB.minor) return parsedA.minor - parsedB.minor;
	if (parsedA.patch !== parsedB.patch) return parsedA.patch - parsedB.patch;

	const aHasPre = parsedA.prerelease.length > 0;
	const bHasPre = parsedB.prerelease.length > 0;

	if (!aHasPre && !bHasPre) return 0;
	if (!aHasPre) return 1;
	if (!bHasPre) return -1;

	const length = Math.max(parsedA.prerelease.length, parsedB.prerelease.length);
	for (let i = 0; i < length; i += 1) {
		const aId = parsedA.prerelease[i];
		const bId = parsedB.prerelease[i];

		if (aId === undefined) return -1;
		if (bId === undefined) return 1;
		if (aId === bId) continue;

		const aIsNum = typeof aId === "number";
		const bIsNum = typeof bId === "number";
		if (aIsNum && bIsNum) return aId - bId;
		if (aIsNum) return -1;
		if (bIsNum) return 1;
		return aId.localeCompare(bId);
	}

	return 0;
}

export function isSemverLt(a: string, b: string): boolean | null {
	const cmp = compareSemver(a, b);
	if (cmp === null) return null;
	return cmp < 0;
}
