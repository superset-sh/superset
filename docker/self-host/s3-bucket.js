const encoder = new TextEncoder();
const hex = (buffer) =>
	[...new Uint8Array(buffer)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
async function hmac(key, value) {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
}
async function hash(value) {
	return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
function encodeKey(key) {
	const segments = key.split("/");
	if (segments.some((segment) => segment === "." || segment === ".."))
		throw new Error("Storage paths must not contain dot segments");
	return segments
		.map((segment) =>
			encodeURIComponent(segment).replace(
				/[!'()*]/g,
				(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
			),
		)
		.join("/");
}
async function signedRequest(config, key) {
	const url = new URL(
		`${config.endpoint.replace(/\/+$/, "")}/${encodeKey(config.bucket)}/${encodeKey(key)}`,
	);
	const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
	const scope = `${date.slice(0, 8)}/${config.region}/s3/aws4_request`;
	const digest = await hash("");
	const headers = `host:${url.host}\nx-amz-content-sha256:${digest}\nx-amz-date:${date}\n`;
	const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
	const canonical = [
		"GET",
		url.pathname,
		"",
		headers,
		signedHeaders,
		digest,
	].join("\n");
	const payload = ["AWS4-HMAC-SHA256", date, scope, await hash(canonical)].join(
		"\n",
	);
	let keyBytes = encoder.encode(`AWS4${config.secret}`);
	for (const part of [date.slice(0, 8), config.region, "s3", "aws4_request"])
		keyBytes = new Uint8Array(await hmac(keyBytes, part));
	return {
		url,
		headers: {
			"x-amz-content-sha256": digest,
			"x-amz-date": date,
			Authorization: `AWS4-HMAC-SHA256 Credential=${config.access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hex(await hmac(keyBytes, payload))}`,
		},
	};
}
function rangeHeader(range) {
	if (!range) return undefined;
	if (range.suffix !== undefined) return `bytes=-${range.suffix}`;
	const offset = range.offset ?? 0;
	return `bytes=${offset}-${range.length === undefined ? "" : offset + range.length - 1}`;
}
export function privateS3Bucket(env) {
	const config = {
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION || "garage",
		bucket: env.S3_BUCKET,
		access: env.S3_ACCESS_KEY,
		secret: env.S3_SECRET_KEY,
	};
	for (const [name, value] of Object.entries(config))
		if (!value) throw new Error(`usercontent storage missing ${name}`);
	return {
		async get(key, options) {
			const request = await signedRequest(config, key);
			const range = rangeHeader(options?.range);
			const response = await fetch(request.url, {
				headers: { ...request.headers, ...(range ? { Range: range } : {}) },
				redirect: "manual",
			});
			if (response.status === 404) return null;
			if (!response.ok)
				throw new Error(`usercontent storage returned ${response.status}`);
			const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
				response.headers.get("content-range") ?? "",
			);
			return {
				body: response.body,
				text: () => response.text(),
				size: match
					? Number(match[3])
					: Number(response.headers.get("content-length") ?? 0),
				range: match
					? {
							offset: Number(match[1]),
							length: Number(match[2]) - Number(match[1]) + 1,
						}
					: undefined,
				httpMetadata: {
					contentType: response.headers.get("content-type") ?? undefined,
				},
			};
		},
	};
}
