import { COMPANY } from "@superset/shared/constants";

// Public half of the Ed25519 key Superset-operated agents sign outbound HTTP
// requests with (Web Bot Auth, RFC 9421). Published at
// /.well-known/http-message-signatures-directory and as the verification
// method of did:web:superset.sh. Rotate by replacing the key and bumping kid.
export const AGENT_SIGNING_KEY = {
	kty: "OKP",
	crv: "Ed25519",
	kid: "tszPKjNfGaEAUTXlSj_OJxfymu5PwWc3FwUksFm2hZM",
	x: "QZWvFiD68EO7ImFetL_jNk8aHlcMDqvcESilvSe2GGY",
	use: "sig",
	alg: "EdDSA",
	// Seconds since epoch. nbf = 2026-08-20, exp = 2028-08-20.
	nbf: 1786924800,
	exp: 1850083200,
} as const;

export const AGENT_DID = `did:web:${COMPANY.DOMAIN}`;
