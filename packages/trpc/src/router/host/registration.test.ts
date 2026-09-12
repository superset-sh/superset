import { expect, test } from "bun:test";
import { registerHost } from "./registration";

const input = {
	organizationId: "org",
	machineId: "victim-machine",
	name: "original",
	version: "1.28.0",
};
function fixture(owner: boolean) {
	let row = {
		name: "Renamed by owner",
		version: "1.27.0",
		platform: "linux-x64",
		installSource: "cli",
	};
	let writes = 0;
	let grants = 0;
	return {
		get row() {
			return row;
		},
		get writes() {
			return writes;
		},
		get grants() {
			return grants;
		},
		store: {
			insert: async () => undefined,
			grantOwner: async () => {
				grants++;
			},
			isOwner: async () => owner,
			update: async (metadata: object) => {
				writes++;
				row = { ...row, ...metadata };
				return row;
			},
			read: async () => row,
		},
	};
}
test("an organization member cannot overwrite another machine's reported build or gain ownership", async () => {
	const f = fixture(false);
	await expect(registerHost(input, f.store)).rejects.toMatchObject({
		code: "FORBIDDEN",
	});
	expect(f.writes).toBe(0);
	expect(f.grants).toBe(0);
	expect(f.row.version).toBe("1.27.0");
});
test("an owner can report a new version without erasing omitted metadata or the user's host name", async () => {
	const f = fixture(true);
	await registerHost(input, f.store);
	expect(f.row).toEqual({
		name: "Renamed by owner",
		version: "1.28.0",
		platform: "linux-x64",
		installSource: "cli",
	});
	expect(f.grants).toBe(0);
});
test("legacy registration without metadata stays read-only, including for a former creator", async () => {
	const f = fixture(false);
	await registerHost({ ...input, version: undefined }, f.store);
	expect(f.writes).toBe(0);
	expect(f.grants).toBe(0);
});
test("a newly inserted host grants ownership to its registering caller", async () => {
	const f = fixture(false);
	const result = await registerHost(input, {
		...f.store,
		insert: async () => f.row,
	});
	expect(result.inserted).toBe(true);
	expect(f.grants).toBe(1);
});
test("platform-only metadata writes also require ownership", async () => {
	const f = fixture(false);
	await expect(
		registerHost(
			{ ...input, version: undefined, platform: "linux-arm64" },
			f.store,
		),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(f.writes).toBe(0);
});
