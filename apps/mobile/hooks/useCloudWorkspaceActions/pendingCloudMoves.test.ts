import { describe, expect, test } from "bun:test";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import {
	beginCloudMove,
	endCloudMove,
	withPendingCloudMoves,
} from "./pendingCloudMoves";

const row = (id: string, status: CloudWorkspaceRow["status"]) =>
	({ id, status }) as CloudWorkspaceRow;

describe("withPendingCloudMoves", () => {
	test("keeps a row in the list it was just moved to until the move ends", () => {
		const archiving = row("a", "deleted");
		beginCloudMove("archived", archiving);

		const active = withPendingCloudMoves("active", [
			row("a", "ready"),
			row("b", "ready"),
		]);
		const archived = withPendingCloudMoves("archived", []);
		expect(active.map((r) => r.id)).toEqual(["b"]);
		expect(archived).toEqual([archiving]);

		endCloudMove("a");
		expect(
			withPendingCloudMoves("active", [row("a", "ready")]).map((r) => r.id),
		).toEqual(["a"]);
	});
});
