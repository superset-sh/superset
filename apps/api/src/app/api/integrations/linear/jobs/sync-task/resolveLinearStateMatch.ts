export interface LinearStateCandidate {
	id: string;
	name: string;
	type: string;
}

export type LinearStateMatch =
	| {
			matchedBy: "externalId" | "name" | "uniqueType";
			stateId: string;
			stateName: string;
	  }
	| {
			matchedBy: "ambiguousType";
			candidateNames: string[];
	  }
	| {
			matchedBy: "none";
	  };

export function resolveLinearStateMatch(
	states: LinearStateCandidate[],
	{
		statusName,
		statusExternalId,
		statusType,
	}: {
		statusName: string;
		statusExternalId?: string | null;
		statusType?: string | null;
	},
): LinearStateMatch {
	if (statusExternalId) {
		const idMatch = states.find((state) => state.id === statusExternalId);
		if (idMatch) {
			return {
				matchedBy: "externalId",
				stateId: idMatch.id,
				stateName: idMatch.name,
			};
		}
	}

	const normalizedStatusName = statusName.trim().toLowerCase();
	const nameMatch = states.find(
		(state) => state.name.trim().toLowerCase() === normalizedStatusName,
	);
	if (nameMatch) {
		return {
			matchedBy: "name",
			stateId: nameMatch.id,
			stateName: nameMatch.name,
		};
	}

	if (statusType) {
		const typeMatches = states.filter((state) => state.type === statusType);
		if (typeMatches.length === 1) {
			const [typeMatch] = typeMatches;
			if (typeMatch) {
				return {
					matchedBy: "uniqueType",
					stateId: typeMatch.id,
					stateName: typeMatch.name,
				};
			}
		}

		if (typeMatches.length > 1) {
			return {
				matchedBy: "ambiguousType",
				candidateNames: typeMatches.map((state) => state.name),
			};
		}
	}

	return { matchedBy: "none" };
}
