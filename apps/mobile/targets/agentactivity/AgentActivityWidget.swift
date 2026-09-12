import ActivityKit
import SwiftUI
import WidgetKit

/// Measured off the reference card, then tightened until four rows with icons
/// fit under the 160pt truncation limit. Values in points.
private enum Metrics {
	static let hPadding: CGFloat = 16
	/// Equal on both edges so the rows sit centred in the card.
	static let vPadding: CGFloat = 16
	static let rowGap: CGFloat = 5
	static let rowsToFooter: CGFloat = 8
	/// 16, not 18: an 18pt icon grows the row past the 19.2pt text line and
	/// four rows then overrun the card by 5pt.
	static let icon: CGFloat = 16
	static let nameSize: CGFloat = 16
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

/// The card inherits the Lock Screen's appearance, which can be light, so each
/// state carries a darker light-mode partner. Both sit over a photo, where the
/// app's full-chroma tokens shout: these keep the app's hues at roughly half
/// the chroma. Coordinates are OKLCH (lightness, chroma, hue) for regenerating.
private func adaptive(dark: (Double, Double, Double), light: (Double, Double, Double)) -> Color {
	Color(UIColor { traits in
		let c = traits.userInterfaceStyle == .light ? light : dark
		return UIColor(red: c.0, green: c.1, blue: c.2, alpha: 1)
	})
}

private func stateColor(_ state: String) -> Color {
	switch state {
	// oklch(0.80 0.12 82) / oklch(0.55 0.12 82)
	case "permission": return adaptive(dark: (0.895, 0.713, 0.363), light: (0.581, 0.411, 0.0))
	// oklch(0.70 0.13 25) / oklch(0.50 0.13 25)
	case "failed": return adaptive(dark: (0.894, 0.486, 0.458), light: (0.628, 0.248, 0.234))
	// oklch(0.74 0.11 152) / oklch(0.50 0.11 152)
	case "review": return adaptive(dark: (0.450, 0.749, 0.534), light: (0.149, 0.457, 0.261))
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
			Text(row.name)
				.font(.system(size: Metrics.nameSize))
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

	/// With no headline, the footer is the one line where the card can admit
	/// it has stopped hearing anything.
	private var footer: String? {
		context.isStale ? context.state.staleDetail : context.state.more
	}

	var body: some View {
		VStack(alignment: .leading, spacing: 0) {
			VStack(alignment: .leading, spacing: Metrics.rowGap) {
				ForEach(context.state.rows) { row in
					// Each row is its own tap target: one Link per agent, with
					// the card-wide widgetURL below as the fallback.
					Link(destination: rowURL(row)) {
						Row(row: row)
					}
				}
			}
			if let footer, !footer.isEmpty {
				Spacer().frame(height: Metrics.rowsToFooter)
				Text(footer)
					.font(.system(size: Metrics.metaSize))
					.foregroundStyle(.tertiary)
					.lineLimit(1)
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
				.padding(.vertical, Metrics.vPadding)
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
				Text("\(context.state.totalCount)")
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
