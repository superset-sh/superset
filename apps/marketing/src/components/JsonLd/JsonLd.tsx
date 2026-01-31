import { COMPANY } from "@superset/shared/constants";

export function OrganizationJsonLd() {
	const schema = {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: COMPANY.NAME,
		url: COMPANY.MARKETING_URL,
		logo: `${COMPANY.MARKETING_URL}/logo.png`,
		description: "Run 10+ parallel coding agents on your machine",
		sameAs: [COMPANY.GITHUB_URL, COMPANY.X_URL],
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
		name: COMPANY.NAME,
		operatingSystem: "macOS, Windows, Linux",
		applicationCategory: "DeveloperApplication",
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		},
		description: "Run 10+ parallel coding agents on your machine",
		url: COMPANY.MARKETING_URL,
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
			name: COMPANY.NAME,
			logo: {
				"@type": "ImageObject",
				url: `${COMPANY.MARKETING_URL}/logo.png`,
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

export function WebsiteJsonLd() {
	const schema = {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: COMPANY.NAME,
		url: COMPANY.MARKETING_URL,
		potentialAction: {
			"@type": "SearchAction",
			target: {
				"@type": "EntryPoint",
				urlTemplate: `${COMPANY.MARKETING_URL}/blog?q={search_term_string}`,
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
