// Listing intentionally omits `statusCheckRollup`. Issue #4246: GitHub's
// GraphQL endpoint returns HTTP 504 when this query also materializes
// `statusCheckRollup.contexts(first: 50)` across 100 PRs on a busy repo
// (the per-request deadline is exceeded for the 100×50 nested fetch).
// Checks are fetched separately, per-PR, only for PRs the caller cares
// about — see `PULL_REQUEST_CHECKS_QUERY`.
export const PULL_REQUESTS_QUERY = `
	query PullRequestsForSidebar($owner: String!, $repo: String!) {
		repository(owner: $owner, name: $repo) {
			pullRequests(first: 100, states: [OPEN, CLOSED, MERGED], orderBy: { field: UPDATED_AT, direction: DESC }) {
				nodes {
					number
					title
					url
					state
					isDraft
					headRefName
					headRefOid
					isCrossRepository
					headRepositoryOwner { login }
					headRepository { name }
					reviewDecision
					updatedAt
				}
			}
		}
	}
`;

export const PULL_REQUEST_CHECKS_QUERY = `
	query PullRequestChecksForSidebar($owner: String!, $repo: String!, $number: Int!) {
		repository(owner: $owner, name: $repo) {
			pullRequest(number: $number) {
				statusCheckRollup {
					contexts(first: 50) {
						nodes {
							__typename
							... on CheckRun {
								name
								conclusion
								detailsUrl
								status
								startedAt
								completedAt
								checkSuite {
									workflowRun {
										databaseId
									}
								}
							}
							... on StatusContext {
								context
								state
								targetUrl
								createdAt
							}
						}
					}
				}
			}
		}
	}
`;
