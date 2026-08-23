import SwiftUI

/// The terminal's quick keys — esc/tab/arrows the soft keyboard lacks — as a
/// scrolling strip above the card.
///
/// Native, and not negotiable about it. These used to be React Native siblings
/// of the composer, and the gap to the pill was a hardcoded guess at a height
/// the host view under-reported: it drifted whenever the pill grew and animated
/// on its own curve. Inside the composer's tree the gap is one stack spacing.
///
/// Only the *shape* of a key crosses the bridge. What each one writes into the
/// PTY is React Native's business — the composer reports an id and forgets.
struct ComposerQuickKeys: View {
  let keys: [ComposerQuickKey]
  let onPress: (String) -> Void

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: ComposerMetrics.quickKeySpacing) {
        ForEach(keys) { key in
          Button { onPress(key.id) } label: {
            label(for: key)
              .frame(minWidth: ComposerMetrics.quickKeyMinWidth)
          }
          // `.bordered`, not `.glass`. Glass over the terminal reads as a smear
          // — it is a material meant to sample rich content behind it, and the
          // content here is a mostly-black scrollback. The bordered style is
          // the same restrained chip the row had before, and it still brings
          // the system's press feedback, hit slop and contrast handling.
          .buttonStyle(.bordered)
          .buttonBorderShape(.roundedRectangle(radius: ComposerMetrics.quickKeyRadius))
          .tint(.secondary)
          .accessibilityLabel(key.label ?? key.id)
        }
      }
      .padding(.horizontal, ComposerMetrics.horizontalMargin)
    }
    .scrollIndicators(.hidden)
    .scrollClipDisabled()
  }

  @ViewBuilder
  private func label(for key: ComposerQuickKey) -> some View {
    if let symbol = key.symbol, !symbol.isEmpty {
      Image(systemName: symbol)
        .font(.system(size: ComposerMetrics.quickKeyGlyphSize))
    } else {
      Text(key.label ?? "")
        .font(.system(size: ComposerMetrics.quickKeyGlyphSize, design: .monospaced))
    }
  }
}
