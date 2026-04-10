import * as p from "@clack/prompts";
import { CLIError, command, positional } from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";
import { getApiUrl, readConfig, writeConfig } from "../../../lib/config";

export default command({
	description: "Switch active organization",

	args: [positional("nameOrId").desc("Organization name, slug, or ID")],

	run: async (opts) => {
		const api = opts.ctx.api as ApiClient;
		const nameOrId = opts.args.nameOrId as string | undefined;
		const orgs = await api.user.myOrganizations.query();
		const config = readConfig();
		const currentOrgId = config.activeOrg?.id;

		let org: (typeof orgs)[number] | undefined;

		if (nameOrId) {
			// Direct switch by name/slug/id
			org = orgs.find(
				(o) =>
					o.id === nameOrId ||
					o.name.toLowerCase() === nameOrId.toLowerCase() ||
					o.slug === nameOrId,
			);

			if (!org) {
				throw new CLIError(
					`Organization not found: ${nameOrId}`,
					"Run: superset org list",
				);
			}
		} else {
			// Interactive selection
			const selected = await p.select({
				message: "Select an organization",
				options: orgs.map((o) => ({
					value: o.id,
					label: o.name,
					hint: o.id === currentOrgId ? "active" : undefined,
				})),
			});

			if (p.isCancel(selected)) {
				throw new CLIError("Cancelled");
			}

			org = orgs.find((o) => o.id === selected);
			if (!org) throw new CLIError("Organization not found");
		}

		if (org.id === currentOrgId) {
			return {
				data: { id: org.id, name: org.name },
				message: `Already on ${org.name}`,
			};
		}

		// Persist locally so host commands use this org
		config.activeOrg = { id: org.id, name: org.name, slug: org.slug };
		writeConfig(config);

		// Sync server-side active org for tools that read the session
		const apiUrl = getApiUrl(config);
		const res = await fetch(`${apiUrl}/api/auth/organization/set-active`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.auth?.accessToken}`,
			},
			body: JSON.stringify({ organizationId: org.id }),
		});

		if (!res.ok) {
			throw new CLIError(`Failed to switch organization: ${res.status}`);
		}

		return {
			data: { id: org.id, name: org.name },
			message: `Switched to ${org.name}`,
		};
	},
});
