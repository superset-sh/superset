import { db } from "../src/client";
import { members, organizations, users } from "../src/schema/auth";
import { eq } from "drizzle-orm";

// Test users to add
const testUsers = [
	{ name: "Alice Johnson", email: "alice@test.com", role: "owner" },
	{ name: "Bob Smith", email: "bob@test.com", role: "admin" },
	{ name: "Carol Davis", email: "carol@test.com", role: "member" },
	{ name: "David Wilson", email: "david@test.com", role: "member" },
	{ name: "Eve Martinez", email: "eve@test.com", role: "member" },
	{ name: "Frank Brown", email: "frank@test.com", role: "member" },
	{ name: "Grace Lee", email: "grace@test.com", role: "admin" },
	{ name: "Henry Chen", email: "henry@test.com", role: "member" },
];

async function addTestMembers() {
	console.log("🔍 Finding superset organization...");

	// Find the superset org by slug
	const supersetOrg = await db.query.organizations.findFirst({
		where: eq(organizations.slug, "superset"),
	});

	if (!supersetOrg) {
		console.error("❌ Superset organization not found!");
		console.log("Available organizations:");
		const allOrgs = await db.select().from(organizations);
		console.table(allOrgs);
		process.exit(1);
	}

	console.log(`✅ Found organization: ${supersetOrg.name} (${supersetOrg.id})`);
	console.log(`\n📝 Adding ${testUsers.length} test users...\n`);

	for (const testUser of testUsers) {
		try {
			// Check if user already exists
			let user = await db.query.users.findFirst({
				where: eq(users.email, testUser.email),
			});

			if (!user) {
				// Create the user
				const [newUser] = await db
					.insert(users)
					.values({
						name: testUser.name,
						email: testUser.email,
						emailVerified: true,
						organizationIds: [supersetOrg.id],
					})
					.returning();
				user = newUser;
				console.log(`✅ Created user: ${testUser.name} (${testUser.email})`);
			} else {
				console.log(`⏭️  User already exists: ${testUser.name} (${testUser.email})`);
			}

			// Check if membership already exists
			const existingMember = await db.query.members.findFirst({
				where: (m, { and, eq }) =>
					and(
						eq(m.userId, user.id),
						eq(m.organizationId, supersetOrg.id),
					),
			});

			if (!existingMember) {
				// Add them as a member
				await db.insert(members).values({
					userId: user.id,
					organizationId: supersetOrg.id,
					role: testUser.role,
				});
				console.log(
					`   ➕ Added as ${testUser.role} to ${supersetOrg.name}`,
				);
			} else {
				console.log(`   ⏭️  Already a member with role: ${existingMember.role}`);
			}
		} catch (error) {
			console.error(`❌ Error adding ${testUser.name}:`, error);
		}
		console.log();
	}

	// Show summary
	console.log("📊 Summary:");
	const allMembers = await db.query.members.findMany({
		where: eq(members.organizationId, supersetOrg.id),
		with: {
			user: true,
		},
	});

	console.log(`\nTotal members in ${supersetOrg.name}: ${allMembers.length}\n`);
	console.table(
		allMembers.map((m) => ({
			Name: m.user.name,
			Email: m.user.email,
			Role: m.role,
		})),
	);

	process.exit(0);
}

addTestMembers().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
