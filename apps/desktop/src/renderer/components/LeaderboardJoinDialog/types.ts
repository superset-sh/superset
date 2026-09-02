import type { RouterOutputs } from "@superset/trpc";

export type LeaderboardPreview = Pick<
	RouterOutputs["leaderboard"]["previewRank"],
	"rank" | "total"
> & {
	tokens: number;
	providers: string[];
};
