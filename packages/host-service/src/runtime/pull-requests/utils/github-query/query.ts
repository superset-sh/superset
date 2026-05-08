export const PULL_REQUEST_FOR_BRANCH_QUERY = `
	query PullRequestForBranch($owner: String!, $repo: String!, $branch: String!) {
		repository(owner: $owner, name: $repo) {
			pullRequests(
				headRefName: $branch
				first: 1
				states: [OPEN, CLOSED, MERGED]
				orderBy: { field: UPDATED_AT, direction: DESC }
			) {
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
