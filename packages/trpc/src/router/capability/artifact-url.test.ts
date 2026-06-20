import { describe, expect, test } from "bun:test";
import { capabilityArtifactDownloadUrl } from "./artifact-url";

describe("capabilityArtifactDownloadUrl", () => {
	test("builds a content-addressed API download URL", () => {
		expect(
			capabilityArtifactDownloadUrl({
				apiUrl: "https://api.superset.example///",
				versionId: "11111111-1111-4111-8111-111111111111",
				sha256:
					"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			}),
		).toBe(
			"https://api.superset.example/api/capability-artifacts/11111111-1111-4111-8111-111111111111/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.zip",
		);
	});
});
