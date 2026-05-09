// Lightweight PR list — identity, branch, review decision only.
// Intentionally OMITS `statusCheckRollup` because materializing
// `contexts(first: 50)` across 100 PRs in one request makes GitHub's GraphQL
// server time out (504) on repos with many active PRs and many checks per PR.
// Checks are fetched separately via `PULL_REQUEST_CHECKS_QUERY` for matched
// PRs only — typically a handful per project.
export const PULL_REQUESTS_LIST_QUERY = `
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
