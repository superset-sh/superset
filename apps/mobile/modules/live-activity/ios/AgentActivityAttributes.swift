import ActivityKit
import Foundation

/// Shared with the app target. ActivityKit matches the app's
/// `Activity<AgentActivityAttributes>` to the widget's `ActivityConfiguration`
/// by type name, so both targets carry their own copy of this declaration.
struct AgentActivityAttributes: ActivityAttributes {
	/// The App Group both targets read and write. The Live Activity sandbox
	/// has no network, so project icons arrive as files, never as URLs.
	static let appGroup = "group.sh.superset.mobile"

	struct AgentRow: Codable, Hashable, Identifiable {
		/// Terminal id. Identity for ForEach, and the tab the link selects.
		var id: String
		/// The workspace the terminal belongs to. The app has no /terminal
		/// route — a session is reached as /workspace/<id>?tab=<terminalId>.
		var workspaceId: String
		var name: String
		/// Only used to draw the initial when there is no cached icon.
		var project: String
		/// Filename inside the App Group container, or nil to draw the initial.
		/// ~40% of projects have no icon at all, so the fallback is the common
		/// path, not an error path.
		var iconFile: String?
		/// Pre-translated status word — "Needs you", "Working", "Review".
		/// Never a bare colour: at this size yellow-500 and amber-500 are
		/// the same colour, which is what the first build got wrong.
		var status: String
		/// permission | working | failed | review — tint only.
		var state: String
		/// Time in the current state, already formatted — "12m", "1h", "3d".
		/// Not a Date: SwiftUI's free-ticking `Text(style: .timer)` can only
		/// render mm:ss, and the app's own compact format is what people read
		/// everywhere else. Formatting in JS also keeps it inside Lingui's
		/// catalogs rather than hardcoding units in Swift.
		var elapsed: String
		/// This row's host has stopped reporting. Per row, not per card —
		/// one Mac sleeping says nothing about the cloud agents.
		var isQuiet: Bool
	}

	struct ContentState: Codable, Hashable {
		/// "1 needs you · 4 agents". Pre-translated. Dynamic Island only;
		/// the Lock Screen card shows the rows alone.
		var headline: String
		/// Ranked by the shared STATUS_PRIORITY, then recency. Attention
		/// states are never truncated; only `working` rows are.
		var rows: [AgentRow]
		/// "+6 more working", or nil when nothing was dropped.
		var more: String?
		/// Every agent, not just the rows that fit. `rows` is capped at four,
		/// so the Dynamic Island would otherwise say "4" for a fleet of nine.
		var totalCount: Int
		/// Most urgent state in the fleet — tints the Dynamic Island.
		var topState: String
		/// Shown instead of the headline once ActivityKit marks the activity
		/// stale. The flag itself is ActivityKit's (`context.isStale`), driven
		/// by the staleDate we pass on every update — a field of our own could
		/// never be set, because by definition nothing is updating us.
		var staleDetail: String
	}

	var machineName: String
}
