/**
 * Review Feature Types (Client)
 */

export interface ReviewSummaryData {
  averageRating: number;
  totalCount: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export type ReviewStatus = "pending" | "approved" | "hidden";
export type ReportStatus = "pending" | "resolved" | "dismissed";
export type ReportReason = "spam" | "inappropriate" | "offensive" | "fake" | "other";
export type SortOrder = "recent" | "rating_high" | "rating_low" | "helpful" | "oldest";
