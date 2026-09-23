export {
	type HostProjectGroup,
	type HostProjectGroupMember,
	type UseHostProjectGroupsResult,
	useHostProjectGroups,
} from "./useHostProjectGroups";
export {
	collectSourceFolderOnlyProjectIds,
	findPrimaryMember,
	findProjectGroupForProject,
	HOST_PROJECT_GROUPS_QUERY_PREFIX,
	indexProjectGroupsByPrimaryProjectId,
} from "./useHostProjectGroups.utils";
