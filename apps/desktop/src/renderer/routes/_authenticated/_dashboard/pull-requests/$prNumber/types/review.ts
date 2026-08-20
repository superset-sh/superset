/**
 * Shapes for the Review tab's risk-triaged summary. Modeled after an external
 * PR-review agent's chapter/riskLevel contract — see PullRequestReviewTab for
 * the placeholder-data note. Nothing here is produced by a backend yet.
 */
export type RiskLevel = "high" | "medium" | "low" | null;

export interface ReviewKeyChange {
	content: string;
	lineRefs: string[];
}

export interface ReviewChapter {
	id: string;
	order: number;
	title: string;
	summary: string;
	keyChanges: ReviewKeyChange[];
	riskLevel: RiskLevel;
	riskReasons: string[];
	additions: number;
	deletions: number;
}

export type EvidenceKind = "document" | "image" | "video";

export interface EvidenceItem {
	id: string;
	label: string;
	kind: EvidenceKind;
}

export type ReviewCommentStatus = "resolved" | "high-risk";

export interface ReviewComment {
	id: string;
	authorName: string;
	authorAvatarUrl: string | null;
	status: ReviewCommentStatus;
	body: string;
}

export interface ReviewTabData {
	whatItDoes: string;
	keyChanges: string[];
	reviewFocus: string[];
	chapters: ReviewChapter[];
	evidence: EvidenceItem[];
	comments: ReviewComment[];
}
