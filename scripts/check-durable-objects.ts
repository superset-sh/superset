import wrangler from "../apps/realtime/wrangler.jsonc";

interface Migration {
	tag: string;
	new_sqlite_classes?: string[];
	new_classes?: string[];
	deleted_classes?: string[];
	renamed_classes?: { from: string; to: string }[];
}

const CONFIG = "apps/realtime/wrangler.jsonc";
const PROTECTED = ["PageHub", "OrgHub"];

const config = wrangler as {
	durable_objects?: { bindings?: { class_name: string }[] };
	migrations?: Migration[];
};

const failures: string[] = [];

for (const migration of config.migrations ?? []) {
	for (const name of migration.deleted_classes ?? []) {
		if (PROTECTED.includes(name)) {
			failures.push(
				`${CONFIG}: migration "${migration.tag}" deletes ${name}. That destroys every instance's storage and cannot be undone.`,
			);
		}
	}
	for (const rename of migration.renamed_classes ?? []) {
		const name = PROTECTED.includes(rename.from)
			? rename.from
			: PROTECTED.includes(rename.to)
				? rename.to
				: null;
		if (name) {
			failures.push(
				`${CONFIG}: migration "${migration.tag}" renames ${rename.from} to ${rename.to}. Instances are addressed by class, so ${name}'s storage is orphaned.`,
			);
		}
	}
}

const bound = (config.durable_objects?.bindings ?? []).map(
	(binding) => binding.class_name,
);
const created = (config.migrations ?? []).flatMap((migration) => [
	...(migration.new_sqlite_classes ?? []),
	...(migration.new_classes ?? []),
]);
for (const name of PROTECTED) {
	if (bound.includes(name) && !created.includes(name)) {
		failures.push(
			`${CONFIG}: ${name} is bound but no migration creates it, so a deploy will not provision it.`,
		);
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log(
	`${CONFIG}: durable object classes are safe (${bound.join(", ")}).`,
);
