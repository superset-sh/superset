import ActivityKit
import SwiftUI
import WidgetKit

/// Measured off the reference card, then tightened until four rows with icons
/// fit under the 160pt truncation limit. Values in points.
private enum Metrics {
	static let hPadding: CGFloat = 16
	static let topPadding: CGFloat = 19
	static let bottomPadding: CGFloat = 13
	static let headToRows: CGFloat = 13
	static let rowGap: CGFloat = 5
	/// 16, not 18: an 18pt icon grows the row past the 19.2pt text line and
	/// four rows then overrun the card by 5pt.
	static let icon: CGFloat = 16
	static let headSize: CGFloat = 14
	static let branchSize: CGFloat = 16
	static let metaSize: CGFloat = 13
	static let timeWidth: CGFloat = 36
}

/// The app has no /terminal route: a session is a tab within its workspace.
private func rowURL(_ row: AgentActivityAttributes.AgentRow) -> URL {
	// Route groups like (authenticated) are an expo-router organisational
	// device and never appear in a URL. Triple slash = empty host, so the
	// whole thing parses as a path rather than workspace becoming the host.
	URL(string: "superset:///workspace/\(row.workspaceId)?tab=\(row.id)")
		?? URL(string: "superset:///")!
}

/// The card inherits the Lock Screen's appearance, which can be light. The
/// 500-weight tokens are tuned for our dark UI and wash out on white, so each
/// state carries a darker light-mode partner.
private func adaptive(dark: (Double, Double, Double), light: (Double, Double, Double)) -> Color {
	Color(UIColor { traits in
		let c = traits.userInterfaceStyle == .light ? light : dark
		return UIColor(red: c.0, green: c.1, blue: c.2, alpha: 1)
	})
}

private func stateColor(_ state: String) -> Color {
	switch state {
	// yellow-500 / yellow-700
	case "permission": return adaptive(dark: (0.918, 0.702, 0.031), light: (0.631, 0.443, 0.012))
	// red-500 / red-700
	case "failed": return adaptive(dark: (0.937, 0.267, 0.267), light: (0.729, 0.11, 0.11))
	// green-500 / green-700
	case "review": return adaptive(dark: (0.133, 0.773, 0.369), light: (0.082, 0.502, 0.239))
	default: return .secondary
	}
}

/// Icons live in the App Group container because the Live Activity sandbox
/// cannot reach the network. The app downscales and writes them; we only read.
private func cachedIcon(_ file: String?) -> UIImage? {
	guard let file,
		let dir = FileManager.default.containerURL(
			forSecurityApplicationGroupIdentifier: AgentActivityAttributes.appGroup)
	else { return nil }
	return UIImage(contentsOfFile: dir.appendingPathComponent("icons/\(file)").path)
}

private struct ProjectIcon: View {
	let row: AgentActivityAttributes.AgentRow

	var body: some View {
		Group {
			if let image = cachedIcon(row.iconFile) {
				Image(uiImage: image)
					.resizable()
					.aspectRatio(contentMode: .fill)
			} else {
				// The same fallback ProjectAvatar draws everywhere else in the
				// app, so a project with no icon reads as familiar, not broken.
				ZStack {
					Rectangle().fill(.quaternary)
					Text(String(row.project.prefix(1)).uppercased())
						.font(.system(size: Metrics.icon * 0.55, weight: .semibold))
						.foregroundStyle(.secondary)
				}
			}
		}
		.frame(width: Metrics.icon, height: Metrics.icon)
		.clipShape(RoundedRectangle(cornerRadius: Metrics.icon * 0.28, style: .continuous))
	}
}

private struct Row: View {
	let row: AgentActivityAttributes.AgentRow

	var body: some View {
		HStack(spacing: 9) {
			ProjectIcon(row: row)
			Text(row.branch)
				.font(.system(size: Metrics.branchSize))
				.foregroundStyle(.primary)
				.lineLimit(1)
				.truncationMode(.tail)
			Spacer(minLength: 8)
			Text(row.status)
				.font(.system(size: Metrics.metaSize))
				.foregroundStyle(stateColor(row.state))
				.lineLimit(1)
				.fixedSize()
			Text(row.elapsed)
				.font(.system(size: Metrics.metaSize))
				.monospacedDigit()
				.foregroundStyle(.tertiary)
				.multilineTextAlignment(.trailing)
				.frame(width: Metrics.timeWidth, alignment: .trailing)
		}
		.opacity(row.isQuiet ? 0.42 : 1)
	}
}

private struct CardBody: View {
	let context: ActivityViewContext<AgentActivityAttributes>

	var body: some View {
		VStack(alignment: .leading, spacing: 0) {
			Text(context.isStale ? context.state.staleDetail : context.state.headline)
				.font(.system(size: Metrics.headSize))
				.foregroundStyle(
					context.isStale
						? AnyShapeStyle(.secondary) : AnyShapeStyle(stateColor(context.state.topState))
				)
				.lineLimit(1)
			Spacer().frame(height: Metrics.headToRows)
			VStack(alignment: .leading, spacing: Metrics.rowGap) {
				ForEach(context.state.rows) { row in
					// Each row is its own tap target: one Link per agent, with
					// the card-wide widgetURL below as the fallback.
					Link(destination: rowURL(row)) {
						Row(row: row)
					}
				}
			}
			if let more = context.state.more, !more.isEmpty {
				Spacer().frame(height: 8)
				Text(more)
					.font(.system(size: Metrics.metaSize))
					.foregroundStyle(.tertiary)
			}
		}
		.opacity(context.isStale ? 0.55 : 1)
	}
}

struct AgentActivityWidget: Widget {
	var body: some WidgetConfiguration {
		ActivityConfiguration(for: AgentActivityAttributes.self) { context in
			CardBody(context: context)
				.padding(.horizontal, Metrics.hPadding)
				.padding(.top, Metrics.topPadding)
				.padding(.bottom, Metrics.bottomPadding)
				.widgetURL(URL(string: "superset:///"))
		} dynamicIsland: { context in
			DynamicIsland {
				DynamicIslandExpandedRegion(.leading) {
					Text(context.state.headline)
						.font(.system(size: 13))
						.foregroundStyle(stateColor(context.state.topState))
						.lineLimit(1)
						.padding(.leading, 4)
				}
				DynamicIslandExpandedRegion(.bottom) {
					VStack(alignment: .leading, spacing: Metrics.rowGap) {
						ForEach(context.state.rows.prefix(3)) { row in
							Link(destination: rowURL(row)) {
								Row(row: row)
							}
						}
					}
					.padding(.horizontal, 4)
				}
			} compactLeading: {
				Image(systemName: context.state.topState == "permission"
					? "person.wave.2.fill" : "terminal.fill")
					.foregroundStyle(stateColor(context.state.topState))
			} compactTrailing: {
				// The island is a single tap target by design, so it shows the
				// count rather than pretending to be a list.
				Text("\(context.state.rows.count)")
					.font(.system(size: 14, weight: .medium))
					.monospacedDigit()
			} minimal: {
				Image(systemName: "terminal.fill")
					.foregroundStyle(stateColor(context.state.topState))
			}
		}
	}
}

@main
struct AgentActivityBundle: WidgetBundle {
	var body: some Widget {
		AgentActivityWidget()
	}
}
