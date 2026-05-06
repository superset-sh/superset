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
