import SwiftUI

/// The suggestion panel that opens over the terminal while the draft is a
/// bare `/token` — the composer's answer to the desktop slash menu.
///
/// Lives inside the composer's own tree, directly above the quick keys, for
/// the same reason they do: as a React Native sibling it could neither ride
/// `dragOffset` during drag-to-dismiss nor join the expand transaction, and
/// its taps would fall outside the interactive frame the passthrough view
/// hit-tests against.
struct ComposerSlashSuggestions: View {
  let state: ComposerSlashSuggestionState
  /// Room between the header reserve and the quick keys, measured by the
  /// root view. The panel's only cap: shorter content hugs, longer scrolls.
  let availableHeight: CGFloat
  let onSelect: (ComposerSlashCommand) -> Void

  /// Measured content height, so the panel hugs a short list instead of a
  /// ScrollView claiming the full cap for two rows.
  @State private var contentHeight: CGFloat = 0

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(state.matches) { command in
          Button { onSelect(command) } label: { row(command) }
            .buttonStyle(.plain)
        }
      }
      .padding(.vertical, ComposerMetrics.slashPanelInset)
      .onGeometryChange(for: CGFloat.self) { $0.size.height }
        action: { contentHeight = $0 }
    }
    .frame(height: min(contentHeight, availableHeight))
    .scrollBounceBehavior(.basedOnSize)
    // Visible, unlike the quick-key strip: a capped list clips mid-row as its
    // scroll affordance, and the bar is the honest signal there is more.
    .scrollIndicators(.visible)
    // Same one-sheet glass as the card below it, so the pair reads as one
    // composer rather than a menu floating over an unrelated surface.
    .glassEffect(
      .regular,
      in: .rect(cornerRadius: ComposerMetrics.slashPanelRadius)
    )
  }

  private func row(_ command: ComposerSlashCommand) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(command.trigger + command.name)
        .font(.system(size: ComposerMetrics.chromeFontSize, design: .monospaced))
        .foregroundStyle(.primary)
      if let description = command.descriptionText, !description.isEmpty {
        Text(description)
          .font(.system(size: ComposerMetrics.slashDescriptionFontSize))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, ComposerMetrics.textInset + ComposerMetrics.rowPadding)
    .padding(.vertical, ComposerMetrics.slashRowVerticalPadding)
    .contentShape(.rect)
  }
}
