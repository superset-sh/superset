import { COMPANY } from "@superset/shared/constants";

export function GET() {
	const base = COMPANY.MARKETING_URL;

	const schema = {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$id: `${base}/schemas/marketplace/1.0.0.json`,
		title: "Superset plugin marketplace",
		type: "object",
		required: ["name", "plugins"],
		properties: {
			$schema: { type: "string" },
			name: {
				type: "string",
				pattern: "^[a-z0-9][a-z0-9.-]*$",
				description:
					"Marketplace id. Plugins are addressed as <plugin>@<marketplace>.",
			},
			description: { type: "string" },
			owner: {
				type: "object",
				properties: {
					name: { type: "string" },
					url: { type: "string" },
				},
			},
			plugins: {
				type: "array",
				description:
					"An array rather than a map: each entry carries its own name, matching the format this mirrors.",
				items: {
					type: "object",
					required: ["name", "source"],
					additionalProperties: false,
					properties: {
						name: {
							type: "string",
							pattern: "^(?!.*(?:--|\\.\\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$",
						},
						description: { type: "string" },
						author: {
							type: "object",
							properties: {
								name: { type: "string" },
								url: { type: "string" },
							},
						},
						category: { type: "string" },
						homepage: { type: "string" },
						source: {
							type: "string",
							pattern: "^\\./",
							description:
								"Path to the plugin directory, relative to this file. Must stay inside the marketplace root, symlinks resolved.",
						},
						version: {
							type: "string",
							pattern: "^\\d+\\.\\d+\\.\\d+",
							description:
								"The published version, maintained by `superset plugins publish`. Its contents live at <source>/versions/<version>/.",
						},
					},
				},
			},
			featured: {
				type: "array",
				items: { type: "string" },
				description:
					"Ordered plugin names. Curation belongs to the list, not the plugin, and an array carries order that a per-plugin boolean cannot.",
			},
			renames: {
				type: "object",
				additionalProperties: { type: "string" },
				description:
					"Old plugin name to new, so a rename does not orphan existing installs.",
			},
		},
	};

	return Response.json(schema, {
		headers: {
			"Content-Type": "application/schema+json",
			"Cache-Control": "public, max-age=3600, s-maxage=86400",
		},
	});
}
