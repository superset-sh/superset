interface OrganizationJsonLdProps {
	url?: string;
}

export function OrganizationJsonLd({
	url = "https://superset.sh",
}: OrganizationJsonLdProps) {
	const schema = {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: "Superset",
		url,
		logo: `${url}/logo.png`,
		description: "Run 10+ parallel coding agents on your machine",
		sameAs: [
			"https://github.com/AviSupersetSH/superset",
			"https://twitter.com/AviSupersetSH",
		],
	};

	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Safe for JSON-LD structured data
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
		/>
	);
}

export function SoftwareApplicationJsonLd() {
	const schema = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "Superset",
		operatingSystem: "macOS, Windows, Linux",
		applicationCategory: "DeveloperApplication",
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		},
		description: "Run 10+ parallel coding agents on your machine",
		url: "https://superset.sh",
		aggregateRating: {
			"@type": "AggregateRating",
			ratingValue: "5",
			ratingCount: "100",
		},
	};

	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Safe for JSON-LD structured data
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
		/>
	);
}

interface ArticleJsonLdProps {
	title: string;
	description?: string;
	author: string;
	publishedTime: string;
	url: string;
	image?: string;
}

export function ArticleJsonLd({
	title,
	description,
	author,
	publishedTime,
	url,
	image,
}: ArticleJsonLdProps) {
	const schema = {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: title,
		description: description || title,
		author: {
			"@type": "Person",
			name: author,
		},
		publisher: {
			"@type": "Organization",
			name: "Superset",
			logo: {
				"@type": "ImageObject",
				url: "https://superset.sh/logo.png",
			},
		},
		datePublished: publishedTime,
		dateModified: publishedTime,
		mainEntityOfPage: {
			"@type": "WebPage",
			"@id": url,
		},
		...(image && {
			image: {
				"@type": "ImageObject",
				url: image,
			},
		}),
	};

	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Safe for JSON-LD structured data
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
		/>
	);
}

interface WebsiteJsonLdProps {
	url?: string;
	name?: string;
}

export function WebsiteJsonLd({
	url = "https://superset.sh",
	name = "Superset",
}: WebsiteJsonLdProps) {
	const schema = {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name,
		url,
		potentialAction: {
			"@type": "SearchAction",
			target: {
				"@type": "EntryPoint",
				urlTemplate: `${url}/blog?q={search_term_string}`,
			},
			"query-input": "required name=search_term_string",
		},
	};

	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Safe for JSON-LD structured data
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
		/>
	);
}
