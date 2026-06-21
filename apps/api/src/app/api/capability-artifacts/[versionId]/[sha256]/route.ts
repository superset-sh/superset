import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { db } from "@superset/db/client";
import { capabilityPackageVersions } from "@superset/db/schema";
import { parseCapabilityArtifactReference } from "@superset/shared/capability-artifacts";
import { readCapabilityArtifactReference } from "@superset/trpc/capability-artifact-storage";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_REGEX = /^[a-f0-9]{64}$/i;

type CapabilityArtifactRow = {
	id: string;
	artifactUrl: string;
	artifactPathname: string;
	artifactSha256: string;
};

type ReadArtifactReference = typeof readCapabilityArtifactReference;

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function requestedSha256(raw: string): string | null {
	const value = raw.endsWith(".zip") ? raw.slice(0, -4) : raw;
	return SHA256_REGEX.test(value) ? value.toLowerCase() : null;
}

function artifactHeaders(row: CapabilityArtifactRow): HeadersInit {
	return {
		"Content-Type": "application/zip",
		"X-Content-Type-Options": "nosniff",
		"Content-Disposition": `attachment; filename="${row.id}-${row.artifactSha256}.zip"`,
		"Cache-Control": "public, max-age=31536000, immutable",
	};
}

async function readFirstAvailableLocalArtifact(args: {
	row: CapabilityArtifactRow;
	candidates: Array<{ kind: string; path: string }>;
}): Promise<Buffer | null> {
	for (const candidate of args.candidates) {
		try {
			return await readFile(candidate.path);
		} catch (error) {
			console.warn("[capability-artifacts] local artifact candidate missing", {
				versionId: args.row.id,
				sha256: args.row.artifactSha256,
				candidateKind: candidate.kind,
				errorCode:
					error instanceof Error && "code" in error
						? String(error.code)
						: "unknown",
			});
		}
	}
	return null;
}

export async function createCapabilityArtifactResponse(
	row: CapabilityArtifactRow,
	deps: { readArtifactReference?: ReadArtifactReference } = {},
): Promise<Response> {
	const readArtifactReference =
		deps.readArtifactReference ?? readCapabilityArtifactReference;
	const artifactPathname = parseCapabilityArtifactReference(row.artifactUrl);
	if (artifactPathname) {
		const bytes = await readArtifactReference(artifactPathname);
		return bytes
			? createZipResponse({ row, bytes })
			: new Response("Capability artifact not found", { status: 404 });
	}

	let artifactUrl: URL;
	try {
		artifactUrl = new URL(row.artifactUrl);
	} catch (error) {
		console.error("[capability-artifacts] invalid artifact URL", {
			versionId: row.id,
			sha256: row.artifactSha256,
			error,
		});
		return new Response("Capability artifact is not available", {
			status: 500,
		});
	}

	if (artifactUrl.protocol === "http:" || artifactUrl.protocol === "https:") {
		return Response.redirect(artifactUrl.toString(), 302);
	}

	if (artifactUrl.protocol !== "file:") {
		console.error("[capability-artifacts] unsupported artifact URL protocol", {
			versionId: row.id,
			sha256: row.artifactSha256,
			protocol: artifactUrl.protocol,
		});
		return new Response("Capability artifact is not available", {
			status: 500,
		});
	}

	const bytes = await readFirstAvailableLocalArtifact({
		row,
		candidates: [{ kind: "legacy-file-url", path: fileURLToPath(artifactUrl) }],
	});
	const artifactBytes =
		bytes ?? (await readArtifactReference(row.artifactPathname));
	if (!artifactBytes) {
		return new Response("Capability artifact not found", { status: 404 });
	}

	return createZipResponse({ row, bytes: artifactBytes });
}

function createZipResponse(args: {
	row: CapabilityArtifactRow;
	bytes: Buffer;
}): Response {
	const { row, bytes } = args;
	if (sha256(bytes) !== row.artifactSha256) {
		console.error("[capability-artifacts] local artifact checksum mismatch", {
			versionId: row.id,
			sha256: row.artifactSha256,
		});
		return new Response("Capability artifact checksum mismatch", {
			status: 409,
		});
	}

	return new Response(new Blob([new Uint8Array(bytes)]), {
		status: 200,
		headers: artifactHeaders(row),
	});
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ versionId: string; sha256: string }> },
): Promise<Response> {
	const { versionId, sha256: rawSha256 } = await params;
	const artifactSha256 = requestedSha256(rawSha256);
	if (!UUID_REGEX.test(versionId) || !artifactSha256) {
		return new Response("Not found", { status: 404 });
	}

	const [version] = await db
		.select({
			id: capabilityPackageVersions.id,
			artifactUrl: capabilityPackageVersions.artifactUrl,
			artifactPathname: capabilityPackageVersions.artifactPathname,
			artifactSha256: capabilityPackageVersions.artifactSha256,
		})
		.from(capabilityPackageVersions)
		.where(
			and(
				eq(capabilityPackageVersions.id, versionId),
				eq(capabilityPackageVersions.artifactSha256, artifactSha256),
			),
		)
		.limit(1);

	if (!version) {
		return new Response("Not found", { status: 404 });
	}

	return createCapabilityArtifactResponse(version);
}
