/**
 * Hot Score Calculation (Reddit Algorithm)
 *
 * score = sign(votes) * log10(max(|votes|, 1)) + seconds / 45000
 */
export function calculateHotScore(upvotes: number, downvotes: number, createdAt: Date): number {
  const score = upvotes - downvotes;
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  const seconds = (createdAt.getTime() - new Date("2005-12-08").getTime()) / 1000;

  return sign * order + seconds / 45000;
}

/**
 * Controversial Score Calculation
 *
 * Posts with similar upvotes and downvotes are controversial
 */
export function calculateControversialScore(upvotes: number, downvotes: number): number {
  if (upvotes === 0 || downvotes === 0) return 0;

  const magnitude = upvotes + downvotes;
  const balance = upvotes > downvotes ? downvotes / upvotes : upvotes / downvotes;

  return magnitude * balance;
}
