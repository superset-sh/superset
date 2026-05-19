import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

const DEV_ADMIN_EMAIL = "admin@local.test";
const DEV_ADMIN_PASSWORD = "supersetdev";
const DEV_ADMIN_NAME = "Local Admin";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function requireLocalUrl(value: string, label: string): URL {
	const url = new URL(value);
	if (!LOCAL_HOSTS.has(url.hostname)) {
		console.error(
			`FATAL: db:seed refuses to run against non-localhost ${label}: ${url.hostname}`,
		);
		process.exit(1);
	}
	return url;
}

async function main() {
	if (process.env.NODE_ENV === "production") {
		console.error("FATAL: db:seed refuses to run in production");
		process.exit(1);
	}

	const dbUrl = process.env.DATABASE_URL;
	if (!dbUrl) {
		console.error("FATAL: DATABASE_URL not set");
		process.exit(1);
	}

	requireLocalUrl(dbUrl, "database host");

	const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4641";
	requireLocalUrl(apiUrl, "API host");
	const endpoint = `${apiUrl}/api/auth/sign-up/email`;

	console.log(`Seeding dev admin via ${endpoint}`);

	const res = await fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: DEV_ADMIN_EMAIL,
			password: DEV_ADMIN_PASSWORD,
			name: DEV_ADMIN_NAME,
		}),
	}).catch((err) => {
		console.error(`FATAL: could not reach ${apiUrl} — is the API running?`);
		console.error(err.message);
		process.exit(1);
	});

	if (res.status === 200) {
		console.log(`✓ Created ${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD}`);
		return;
	}

	const body = (await res.json().catch(() => ({}))) as {
		code?: string;
		message?: string;
	};

	if (body.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
		console.log(
			`✓ ${DEV_ADMIN_EMAIL} already exists (password: ${DEV_ADMIN_PASSWORD})`,
		);
		return;
	}

	console.error(`FATAL: sign-up returned ${res.status}: ${body.message ?? ""}`);
	process.exit(1);
}

main();
