import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { db } from "@superset/db/client";
import { capabilityPackageVersions } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_REGEX = /^[a-f0-9]{64}$/i;

type CapabilityArtifactRow = {
	id: string;
	artifactUrl: string;
	artifactSha256: string;
};

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

export async function createCapabilityArtifactResponse(
	row: CapabilityArtifactRow,
): Promise<Response> {
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

	let bytes: Buffer;
	try {
		bytes = await readFile(fileURLToPath(artifactUrl));
	} catch (error) {
		console.error("[capability-artifacts] local artifact missing", {
			versionId: row.id,
			sha256: row.artifactSha256,
			error: error instanceof Error ? error.message : String(error),
		});
		return new Response("Capability artifact not found", { status: 404 });
	}

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
