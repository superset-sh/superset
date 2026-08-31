import SwiftUI

/// The terminal's quick keys — esc/tab/arrows the soft keyboard lacks — as one
/// surface with the keys scrolling inside it.
///
/// Native, and not negotiable about it. These used to be React Native siblings
/// of the composer, and the gap to the pill was a hardcoded guess at a height
/// the host view under-reported: it drifted whenever the pill grew and animated
/// on its own curve. Inside the composer's tree the gap is one stack spacing.
///
/// One surface rather than a backdrop per key. Nine `.bordered` buttons spent
/// most of the row's width on nine sets of padding and nine rounded corners;
/// sharing a surface buys roughly a third more room, which is what makes the
/// hairline groups — escapes, arrows, return — legible at all. It also puts the
/// glass question to bed: one panel over the scrollback is a surface, where
/// nine floating chips over black were a smear.
///
/// The surface is the fixed part and the keys scroll *within* it. A scroll view
/// wearing a background would slide the panel out of the frame along with the
/// keys.
///
/// Only the *shape* of a key crosses the bridge. What each one writes into the
/// PTY is React Native's business — the composer reports an id and forgets.
struct ComposerQuickKeys: View {
  let keys: [ComposerQuickKey]
  let onPress: (String) -> Void

  /// How wide the keys actually are, and which edges have more behind them.
  /// The width sizes the surface; the edges drive the mask, so a clipped key
  /// reads as "keep going" rather than as a rendering bug.
  @State private var layout = Layout(contentWidth: 0, leading: false, trailing: false)

  private struct Layout: Equatable {
    var contentWidth: CGFloat
    var leading: Bool
    var trailing: Bool
  }

  var body: some View {
    // Leading-aligned with a spacer rather than centred: a surface narrower
    // than the row would otherwise float in the middle of it.
    HStack(spacing: 0) {
      surface
      Spacer(minLength: 0)
    }
    .padding(.horizontal, ComposerMetrics.horizontalMargin)
  }

  private var surface: some View {
    ScrollView(.horizontal) {
      HStack(spacing: ComposerMetrics.quickKeySpacing) {
        ForEach(keys) { key in
          if key.divider {
            Rectangle()
              .fill(.white.opacity(0.16))
              .frame(width: 1, height: ComposerMetrics.quickKeyDividerHeight)
              .padding(.horizontal, ComposerMetrics.quickKeyDividerGap)
              .accessibilityHidden(true)
          } else {
            Button { onPress(key.id) } label: {
              label(for: key).frame(minWidth: ComposerMetrics.quickKeyMinWidth)
            }
            .buttonStyle(QuickKeyStyle())
            .accessibilityLabel(key.label ?? key.id)
          }
        }
      }
      // Every side, not just the horizontal: the inset is what a pressed key
      // sits inside of, and without it on the vertical the highlight was
      // exactly as tall as the bar and spilled over its rounded ends.
      .padding(ComposerMetrics.quickKeyBarInset)
    }
    .scrollIndicators(.hidden)
    // The surface is exactly as wide as the keys, until the keys are wider than
    // the row — `maxWidth` is a cap, so past that it takes what is available and
    // starts scrolling. A greedy scroll view left a stretch of empty panel after
    // the last key, which read as a bar that had lost its contents.
    .frame(maxWidth: layout.contentWidth > 0 ? layout.contentWidth : .infinity)
    // Masks the keys only. Applied before the background so the surface itself
    // never fades — the panel has hard edges, the content inside it does not.
    .mask(mask)
    .background(
      .white.opacity(0.12),
      in: .rect(cornerRadius: ComposerMetrics.quickKeyBarRadius, style: .continuous)
    )
    .onScrollGeometryChange(for: Layout.self) { geometry in
      let maxOffset = geometry.contentSize.width - geometry.containerSize.width
      return Layout(
        contentWidth: geometry.contentSize.width,
        leading: geometry.contentOffset.x > ComposerMetrics.quickKeyScrollThreshold,
        trailing: geometry.contentOffset.x
          < maxOffset - ComposerMetrics.quickKeyScrollThreshold
      )
    } action: { _, next in
      layout = next
    }
  }

  /// Stops rather than a fixed inset, because the gradient is laid out in unit
  /// space. Collapsing a fade to location 0 (or 1) leaves that edge hard, which
  /// is what an unscrollable row should look like.
  private var mask: LinearGradient {
    let fade = ComposerMetrics.quickKeyFadeFraction
    return LinearGradient(
      stops: [
        .init(color: .clear, location: 0),
        .init(color: .black, location: layout.leading ? fade : 0),
        .init(color: .black, location: layout.trailing ? 1 - fade : 1),
        .init(color: .clear, location: 1),
      ],
      startPoint: .leading,
      endPoint: .trailing
    )
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

/// Press feedback for a key inside the shared surface.
///
/// `.bordered` cannot be used here any more: it draws its own filled capsule,
/// which on top of the surface is the double-layering this redesign removes.
/// What is left to replace is the press state and the hit area, both of which
/// the stock style was carrying.
private struct QuickKeyStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .padding(.horizontal, ComposerMetrics.quickKeyPaddingH)
      .frame(height: ComposerMetrics.quickKeyHeight)
      .foregroundStyle(.primary)
      .background(
        .white.opacity(configuration.isPressed ? 0.16 : 0),
        in: .rect(cornerRadius: ComposerMetrics.quickKeyRadius, style: .continuous)
      )
      .animation(.snappy(duration: 0.16), value: configuration.isPressed)
      .contentShape(.rect)
  }
}
