import { COMPANY } from "@superset/shared/constants";
import { AGENT_DID, AGENT_SIGNING_KEY } from "@/lib/agent-identity";

// did:web document for superset.sh. Resolves the identity referenced by the
// ARD ai-catalog trust manifests and the Web Bot Auth key directory.
export function GET() {
	const keyId = `${AGENT_DID}#${AGENT_SIGNING_KEY.kid}`;
	const { kty, crv, x } = AGENT_SIGNING_KEY;
	const document = {
		"@context": [
			"https://www.w3.org/ns/did/v1",
			"https://w3id.org/security/suites/jws-2020/v1",
		],
		id: AGENT_DID,
		verificationMethod: [
			{
				id: keyId,
				type: "JsonWebKey2020",
				controller: AGENT_DID,
				publicKeyJwk: { kty, crv, x },
			},
		],
		authentication: [keyId],
		assertionMethod: [keyId],
		service: [
			{
				id: `${AGENT_DID}#ai-catalog`,
				type: "AgenticResourceCatalog",
				serviceEndpoint: `${COMPANY.MARKETING_URL}/.well-known/ai-catalog.json`,
			},
			{
				id: `${AGENT_DID}#mcp`,
				type: "ModelContextProtocol",
				serviceEndpoint: `${COMPANY.MARKETING_URL}/.well-known/mcp/server-card.json`,
			},
		],
	};

	return Response.json(document, {
		headers: {
			"Content-Type": "application/did+json",
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "public, max-age=86400, s-maxage=86400",
		},
	});
}
