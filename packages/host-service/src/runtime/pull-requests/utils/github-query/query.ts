/**
 * GraphQL query that fetches the latest 100 pull requests for a given repository.
 * Includes PR metadata, review decisions, merge queue status, and CI check results.
 */
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
					reviewDecision
					updatedAt
					mergeQueueEntry {
						position
					}
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
	}
`;
