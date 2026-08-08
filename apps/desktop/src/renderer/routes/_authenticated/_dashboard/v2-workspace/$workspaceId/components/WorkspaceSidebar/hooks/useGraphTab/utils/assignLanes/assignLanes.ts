import type {
	GraphCommit,
	GraphEdge,
	GraphLaneColor,
	GraphRowModel,
} from "../../types";

/**
 * Assigns each commit to a lane and emits the painted edges for its row.
 *
 * Commits arrive in display order: newest first (the tip), oldest last, as
 * `git log --topo-order` yields them. An "active lane" awaits a single parent
 * hash; when that commit is reached the lane either continues down its first
 * parent or closes into the node as a merge.
 *
 * Parents that fall outside the fetched window (older than the oldest row, or
 * absent from the input entirely) stub out: the row emits a short dashed
 * `out-stub` edge and the lane is freed, so the branch visibly terminates
 * instead of trailing on as a solid line.
 */
export function assignLanes(commits: GraphCommit[]): GraphRowModel[] {
	const present = new Set(commits.map((c) => c.hash));
	// lanes[i] = hash lane i is tracking downwards, or null when the slot is free.
	const lanes: (string | null)[] = [];
	const laneColor: GraphLaneColor[] = [];
	const rows: GraphRowModel[] = [];

	// Rotating colour cursor. A lane opening claims the next palette slot no
	// live lane is using, so two parallel lanes never share a colour within the
	// 1..8 ramp. Keying colour to lane index collides the moment a lane closes
	// and its slot is reused by a still-live neighbour; the cursor + live-skip
	// avoids that. Past eight simultaneous lanes a clash is unavoidable and the
	// cursor reuses its slot (the honest ceiling).
	let colorCursor = 0;
	const pickColor = (): GraphLaneColor => {
		const used = new Set<number>();
		for (let i = 0; i < lanes.length; i++) {
			if (lanes[i] !== null) used.add(laneColor[i]);
		}
		for (let step = 0; step < 8; step++) {
			const candidate = ((colorCursor + step) % 8) + 1;
			if (!used.has(candidate)) {
				colorCursor = (colorCursor + step + 1) % 8;
				return candidate as GraphLaneColor;
			}
		}
		// Palette exhausted (9+ live lanes): reuse the cursor slot and advance.
		const reused = (colorCursor % 8) + 1;
		colorCursor = (colorCursor + 1) % 8;
		return reused as GraphLaneColor;
	};

	for (const commit of commits) {
		// Reuse the lane awaiting this commit, else the first free slot, else extend.
		let mine = lanes.indexOf(commit.hash);
		// A lane opened in this row is a branch tip (or the graph tip): nothing
		// above it awaits or reaches this commit, so it must not draw an incoming
		// straight edge — that would read as a parent link to a row that isn't
		// there. Lanes reached via an out-fork take the reuse path below and keep
		// their in-straight, which correctly meets the fork point.
		const openedHere = mine === -1;
		if (mine === -1) {
			mine = lanes.indexOf(null);
			if (mine === -1) {
				mine = lanes.length;
				lanes.push(null);
				laneColor.push(1);
			}
			// Claim a colour nothing live is using, then occupy the slot.
			laneColor[mine] = pickColor();
			lanes[mine] = commit.hash;
		}
		const rowColor = laneColor[mine];

		const edges: GraphEdge[] = [];

		// Incoming sweep: lanes awaiting this commit close into the node; the rest
		// pass through untouched. Several lanes can await one commit when branches
		// reconverge — all but the chosen one merge in and are freed.
		for (let j = 0; j < lanes.length; j++) {
			const awaiting = lanes[j];
			if (awaiting === commit.hash) {
				if (j === mine) {
					if (!openedHere) {
						edges.push({
							kind: "in-straight",
							fromLane: j,
							toLane: j,
							color: laneColor[j],
						});
					}
				} else {
					edges.push({
						kind: "in-merge",
						fromLane: j,
						toLane: mine,
						color: laneColor[j],
					});
					lanes[j] = null;
				}
			} else if (awaiting !== null) {
				edges.push({
					kind: "pass",
					fromLane: j,
					toLane: j,
					color: laneColor[j],
				});
			}
		}

		// First parent inherits the lane — unless it lies outside the window, in
		// which case the branch stubs off and the lane is released.
		const firstParent = commit.parents[0];
		if (commit.parents.length > 0) {
			if (present.has(firstParent)) {
				edges.push({
					kind: "out-straight",
					fromLane: mine,
					toLane: mine,
					color: rowColor,
				});
				lanes[mine] = firstParent;
			} else {
				edges.push({
					kind: "out-stub",
					fromLane: mine,
					toLane: mine,
					color: rowColor,
				});
				lanes[mine] = null;
			}
		} else {
			// Root: the lane ends at this node.
			lanes[mine] = null;
		}

		// Extra parents fork into their own lanes. A forked lane is seeded with the
		// parent hash (perturbed by a counter so sibling forks spread across the
		// palette); when the parent is later reached it inherits that colour.
		for (let p = 1; p < commit.parents.length; p++) {
			const parent = commit.parents[p];
			let k = lanes.indexOf(parent);
			if (k === -1) {
				// Never reclaim this row's own lane: it was just freed above (root,
				// or first parent outside the window) and already carries an
				// out-stub. Reusing it would draw a stub and a live edge on one lane.
				k = lanes.findIndex((slot, i) => slot === null && i !== mine);
				if (k === -1) {
					k = lanes.length;
					lanes.push(null);
					laneColor.push(1);
				}
				laneColor[k] = pickColor();
			}
			if (k === mine) {
				edges.push({
					kind: "out-straight",
					fromLane: mine,
					toLane: k,
					color: laneColor[k],
				});
			} else {
				edges.push({
					kind: "out-fork",
					fromLane: mine,
					toLane: k,
					color: laneColor[k],
				});
			}
			// A forked parent outside the window stops here too — no dead lanes.
			lanes[k] = present.has(parent) ? parent : null;
		}

		// Drop trailing free slots so the array tracks the active span and freed
		// interior slots stay available for reuse by later rows.
		while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
			lanes.pop();
			laneColor.pop();
		}

		let laneCount = Math.max(lanes.length, mine + 1);
		for (const edge of edges) {
			laneCount = Math.max(laneCount, edge.fromLane + 1, edge.toLane + 1);
		}

		rows.push({
			commit,
			lane: mine,
			color: rowColor,
			isMerge: commit.parents.length > 1,
			isRoot: commit.parents.length === 0,
			edges,
			laneCount,
		});
	}

	return rows;
}
