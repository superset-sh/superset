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

interface ArticleAuthor {
	name: string;
	url?: string;
	sameAs?: string[];
}

interface ArticleJsonLdProps {
	title: string;
	description?: string;
	author: ArticleAuthor;
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
			name: author.name,
			...(author.url && { url: author.url }),
			...(author.sameAs &&
				author.sameAs.length > 0 && { sameAs: author.sameAs }),
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

interface ComparisonJsonLdProps {
	title: string;
	description: string;
	publishedTime: string;
	modifiedTime?: string;
	url: string;
	image?: string;
}

export function ComparisonJsonLd({
	title,
	description,
	publishedTime,
	modifiedTime,
	url,
	image,
}: ComparisonJsonLdProps) {
	const schema = {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: title,
		description,
		publisher: {
			"@type": "Organization",
			name: COMPANY.NAME,
			logo: {
				"@type": "ImageObject",
				url: `${COMPANY.MARKETING_URL}/logo.png`,
			},
		},
		datePublished: publishedTime,
		dateModified: modifiedTime || publishedTime,
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
	};

	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Safe for JSON-LD structured data
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
		/>
	);
}

interface FAQPageJsonLdProps {
	items: Array<{ question: string; answer: string }>;
}

export function FAQPageJsonLd({ items }: FAQPageJsonLdProps) {
	const schema = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: items.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: item.answer,
			},
		})),
	};

	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Safe for JSON-LD structured data
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
		/>
	);
}

interface BreadcrumbJsonLdProps {
	items: Array<{ name: string; url: string }>;
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
	const schema = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: item.url,
		})),
	};

	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Safe for JSON-LD structured data
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
		/>
	);
}
