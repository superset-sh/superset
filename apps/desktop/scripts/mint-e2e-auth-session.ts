import { randomBytes } from "node:crypto";
import { env as authEnv } from "@superset/auth/env";
import { dbWs } from "@superset/db/client";
import {
	members,
	organizations,
	sessions,
	users,
} from "@superset/db/schema/auth";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import { and, asc, eq } from "drizzle-orm";

const DEFAULT_EMAIL = "desktop-e2e@local.superset.test";
const DEFAULT_NAME = "Desktop E2E";
const DEFAULT_TTL_HOURS = 12;
const DESKTOP_E2E_SESSION_USER_AGENT = "Superset Desktop E2E";
const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

interface CliOptions {
	email: string;
	name: string;
	ttlHours: number;
}

interface MintedDesktopSession {
	email: string;
	expiresAt: string;
	name: string;
	organizationId: string;
	token: string;
	userId: string;
}

function readBooleanEnv(name: string): boolean {
	const value = process.env[name];
	if (!value) return false;
	return TRUE_ENV_VALUES.has(value.toLowerCase());
}

function parseCliArgs(argv: string[]): CliOptions {
	let email = process.env.DESKTOP_E2E_AUTH_EMAIL ?? DEFAULT_EMAIL;
	let name = process.env.DESKTOP_E2E_AUTH_NAME ?? DEFAULT_NAME;
	let ttlHours = Number(
		process.env.DESKTOP_E2E_AUTH_TTL_HOURS ?? DEFAULT_TTL_HOURS,
	);

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === "--email") {
			email = argv[index + 1] ?? email;
			index += 1;
			continue;
		}

		if (arg === "--name") {
			name = argv[index + 1] ?? name;
			index += 1;
			continue;
		}

		if (arg === "--ttl-hours") {
			const nextValue = Number(argv[index + 1]);
			if (Number.isFinite(nextValue)) {
				ttlHours = nextValue;
			}
			index += 1;
		}
	}

	if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
		throw new Error("TTL hours must be a positive number.");
	}

	return {
		email,
		name,
		ttlHours,
	};
}

function sanitizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function slugify(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);

	return normalized || "desktop-e2e";
}

function assertSafeEnvironment(): void {
	const apiUrl = authEnv.NEXT_PUBLIC_API_URL;
	const isLocalApi =
		apiUrl.includes("localhost") || apiUrl.includes("127.0.0.1");

	if (isLocalApi || readBooleanEnv("DESKTOP_E2E_AUTH_ALLOW_REMOTE")) {
		return;
	}

	throw new Error(
		[
			"Refusing to mint a desktop E2E auth session against a non-local API URL.",
			`Current NEXT_PUBLIC_API_URL: ${apiUrl}`,
			"Set DESKTOP_E2E_AUTH_ALLOW_REMOTE=1 to override explicitly.",
		].join(" "),
	);
}

async function mintDesktopSession({
	email,
	name,
	ttlHours,
}: CliOptions): Promise<MintedDesktopSession> {
	const normalizedEmail = sanitizeEmail(email);
	const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
	const now = new Date();

	return dbWs.transaction(async (tx) => {
		let [user] = await tx
			.select({
				id: users.id,
				name: users.name,
				organizationIds: users.organizationIds,
			})
			.from(users)
			.where(eq(users.email, normalizedEmail))
			.limit(1);

		if (!user) {
			[user] = await tx
				.insert(users)
				.values({
					email: normalizedEmail,
					emailVerified: true,
					name,
					organizationIds: [],
				})
				.returning({
					id: users.id,
					name: users.name,
					organizationIds: users.organizationIds,
				});
		}

		const existingMemberships = await tx
			.select({
				organizationId: members.organizationId,
			})
			.from(members)
			.where(eq(members.userId, user.id))
			.orderBy(asc(members.createdAt));

		let organizationId = existingMemberships[0]?.organizationId ?? null;

		if (!organizationId) {
			const [organization] = await tx
				.insert(organizations)
				.values({
					name: `${user.name}'s Desktop E2E`,
					slug: `${slugify(user.name)}-${user.id.slice(0, 8)}-desktop-e2e`,
				})
				.returning({
					id: organizations.id,
				});

			organizationId = organization.id;

			await tx.insert(members).values({
				organizationId,
				role: "owner",
				userId: user.id,
			});

			await tx
				.update(users)
				.set({
					organizationIds: [organizationId],
				})
				.where(eq(users.id, user.id));

			await seedDefaultStatuses(organizationId, tx);
		} else if (!user.organizationIds.includes(organizationId)) {
			await tx
				.update(users)
				.set({
					organizationIds: [organizationId, ...user.organizationIds],
				})
				.where(eq(users.id, user.id));
		}

		await tx
			.delete(sessions)
			.where(
				and(
					eq(sessions.userId, user.id),
					eq(sessions.userAgent, DESKTOP_E2E_SESSION_USER_AGENT),
				),
			);

		const token = randomBytes(32).toString("base64url");

		await tx.insert(sessions).values({
			token,
			expiresAt,
			userId: user.id,
			activeOrganizationId: organizationId,
			ipAddress: "127.0.0.1",
			userAgent: DESKTOP_E2E_SESSION_USER_AGENT,
			updatedAt: now,
		});

		return {
			token,
			expiresAt: expiresAt.toISOString(),
			email: normalizedEmail,
			name: user.name,
			userId: user.id,
			organizationId,
		};
	});
}

async function main() {
	assertSafeEnvironment();
	const options = parseCliArgs(process.argv.slice(2));
	const mintedSession = await mintDesktopSession(options);
	console.log(JSON.stringify(mintedSession, null, 2));
}

void main().catch((error: unknown) => {
	console.error(
		error instanceof Error ? error.message : "Failed to mint E2E auth session.",
	);
	process.exit(1);
});
