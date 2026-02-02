export interface Author {
	id: string;
	name: string;
	title: string;
	bio?: string;
	twitterHandle?: string;
	githubHandle?: string;
	linkedinUrl?: string;
	avatarUrl?: string;
}

export const AUTHORS: Record<string, Author> = {
	avi: {
		id: "avi",
		name: "Avi Peltz",
		title: "Cofounder, Superset",
		twitterHandle: "avimakesrobots",
		githubHandle: "avipeltz",
	},
	kiet: {
		id: "kiet",
		name: "Kiet Ho",
		title: "Cofounder, Superset",
		twitterHandle: "kietho_",
		githubHandle: "kietho",
	},
};

export function getAuthor(id: string): Author | undefined {
	return AUTHORS[id];
}
