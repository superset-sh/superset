export type RecordMentionItem =
	| { kind: "person"; id: string; name: string; image: string | null }
	| {
			kind: "task";
			id: string;
			slug: string;
			externalProvider: string | null;
			externalKey: string | null;
			title: string;
			status: { type: string; color: string; progressPercent: number | null };
	  }
	| {
			kind: "pull_request";
			id: string;
			number: number;
			title: string;
			url: string;
	  };

export type RecordMentionSearchFn = (
	query: string,
) => Promise<RecordMentionItem[]>;
