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
/// The bar is always exactly as wide as its row. Nine keys are narrower than
/// a Pro Max and wider than an iPhone 17 once the pull request control has
/// taken its share, so neither "hug the keys" nor "fill the row" is right on
/// its own: hugging leaves a stub of empty row after the bar on the wide
/// phones, filling leaves a stretch of empty panel after the last key. The
/// keys therefore share out whatever room the row has beyond their natural
/// width — see `QuickKeyRow` — and start scrolling the moment there is none.
///
/// Only the *shape* of a key crosses the bridge. What each one writes into the
/// PTY is React Native's business — the composer reports an id and forgets.
///
/// The control ahead of the surface — the workspace's pull request, in the
/// only caller today — is a peer of the bar, not a key in it: the keys scroll,
/// it does not, and it has to be reachable however long the strip is. It takes
/// its room only once it exists: the bar has the whole row until then, and the
/// keys slide over when it arrives. Reserving the slot was tried and read as a
/// dead control at the head of the row on every workspace without a pull
/// request, which is most of them for most of their life.
struct ComposerQuickKeys: View {
  let keys: [ComposerQuickKey]
  /// The control beside the keys, or nothing.
  let action: ComposerQuickKeysAction?
  let onPress: (String) -> Void
  let onAction: () -> Void

  /// How wide the bar's viewport is, and which edges have more behind them.
  /// The width is what the keys spread out to fill; the edges drive the mask,
  /// so a clipped key reads as "keep going" rather than as a rendering bug.
  @State private var layout = Layout(viewportWidth: 0, leading: false, trailing: false)

  private struct Layout: Equatable {
    var viewportWidth: CGFloat
    var leading: Bool
    var trailing: Bool
  }

  var body: some View {
    HStack(spacing: ComposerMetrics.quickKeyActionGap) {
      // Inserted, not reserved, so it is only ever on screen when it means
      // something. The keys move once per workspace as a result — the moment
      // a pull request exists — and the module opens a transaction around
      // that, so they slide over together with the bar narrowing behind them
      // rather than jumping.
      if let action {
        Button(action: onAction) {
          glyph(for: action)
            // On the label, not on the button: the style below paints
            // `.primary` on whatever it is handed, and the inner style wins.
            .foregroundStyle(
              ComposerQuickKeysActionTint(rawValue: action.tint ?? "")
                .map { AnyShapeStyle($0.color) } ?? AnyShapeStyle(.primary)
            )
        }
        .buttonStyle(QuickKeysActionStyle())
        .accessibilityLabel(action.label)
        .transition(.opacity)
      }
      // Greedy, so it takes whatever the control leaves — there is no spacer
      // because the bar itself is what fills the row.
      if !keys.isEmpty {
        surface
      }
    }
    .padding(.horizontal, ComposerMetrics.horizontalMargin)
  }

  /// The bundled mark when one has resolved, the SF Symbol until then.
  ///
  /// Templated rather than drawn as-is, so a one-colour mark takes the tint the
  /// symbol would have — the art carries the shape, this side carries the
  /// palette, the same split as everywhere else in the composer.
  @ViewBuilder
  private func glyph(for action: ComposerQuickKeysAction) -> some View {
    if let uri = action.iconUri, !uri.isEmpty, let url = URL(string: uri) {
      AsyncImage(url: url) { image in
        image
          .renderingMode(.template)
          .resizable()
          .aspectRatio(contentMode: .fit)
      } placeholder: {
        // The symbol rather than blank, so the chip does not flash empty on
        // the frame before the file lands.
        symbolGlyph(action.symbol)
      }
      .frame(
        width: ComposerMetrics.quickKeyActionMark,
        height: ComposerMetrics.quickKeyActionMark
      )
    } else {
      symbolGlyph(action.symbol)
    }
  }

  private func symbolGlyph(_ symbol: String) -> some View {
    Image(systemName: symbol)
      .font(.system(size: ComposerMetrics.quickKeyGlyphSize, weight: .semibold))
  }

  private var surface: some View {
    ScrollView(.horizontal) {
      QuickKeyRow(
        // The viewport less the inset on either side, since the inset is
        // applied outside the row and the row cannot see it.
        fillWidth: max(0, layout.viewportWidth - ComposerMetrics.quickKeyBarInset * 2),
        spacing: ComposerMetrics.quickKeySpacing
      ) {
        ForEach(keys) { key in
          if key.divider {
            Rectangle()
              .fill(.white.opacity(0.16))
              .frame(width: 1, height: ComposerMetrics.quickKeyDividerHeight)
              .padding(.horizontal, ComposerMetrics.quickKeyDividerGap)
              .accessibilityHidden(true)
              // A hairline stays a hairline: the room goes to the keys.
              .layoutValue(key: QuickKeyStretches.self, value: false)
          } else {
            Button { onPress(key.id) } label: {
              // `maxWidth` so the label — and with it the press highlight and
              // the hit area — grows to whatever share of the row the layout
              // hands the key, rather than sitting small inside it.
              label(for: key)
                .frame(minWidth: ComposerMetrics.quickKeyMinWidth, maxWidth: .infinity)
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
        viewportWidth: geometry.containerSize.width,
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

/// Whether a subview of `QuickKeyRow` takes a share of the row's spare width.
/// Keys do; the hairlines between groups do not.
private struct QuickKeyStretches: LayoutValueKey {
  static let defaultValue = true
}

/// The keys in a row that is never narrower than they are, and never narrower
/// than the bar's viewport either.
///
/// Room beyond the keys' natural width is split evenly between them, so the
/// bar fills its row with no empty panel after the last key; with no room to
/// spare they sit at their natural width and the scroll view around them takes
/// over. A layout rather than flexible frames because inside a horizontal
/// scroll view the width proposal is unbounded — `maxWidth: .infinity` there
/// means infinite, not "the viewport" — so the viewport has to be handed in.
private struct QuickKeyRow: Layout {
  var fillWidth: CGFloat
  var spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
    return CGSize(
      width: max(naturalWidth(of: sizes), fillWidth),
      height: sizes.map(\.height).max() ?? 0
    )
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
    let stretching = subviews.filter { $0[QuickKeyStretches.self] }.count
    let share = stretching > 0
      ? max(0, bounds.width - naturalWidth(of: sizes)) / CGFloat(stretching)
      : 0
    var x = bounds.minX
    for (subview, size) in zip(subviews, sizes) {
      let width = size.width + (subview[QuickKeyStretches.self] ? share : 0)
      subview.place(
        at: CGPoint(x: x, y: bounds.midY),
        anchor: .leading,
        proposal: ProposedViewSize(width: width, height: size.height)
      )
      x += width + spacing
    }
  }

  private func naturalWidth(of sizes: [CGSize]) -> CGFloat {
    sizes.reduce(0) { $0 + $1.width } + spacing * CGFloat(max(0, sizes.count - 1))
  }
}

/// Press feedback for the control beside the bar.
///
/// The bar's own surface, cut loose: same fill, same corner, same height, so
/// the row reads as one strip with a break in it rather than a chip parked
/// next to a panel.
private struct QuickKeysActionStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .frame(
        width: ComposerMetrics.quickKeyBarHeight,
        height: ComposerMetrics.quickKeyBarHeight
      )
      .foregroundStyle(.primary)
      .background(
        .white.opacity(configuration.isPressed ? 0.20 : 0.12),
        in: .rect(cornerRadius: ComposerMetrics.quickKeyBarRadius, style: .continuous)
      )
      .animation(.snappy(duration: 0.16), value: configuration.isPressed)
      .contentShape(.rect)
  }
}

/// What a linked pull request's state colours the control, as it reaches this
/// side of the bridge.
///
/// Same split as `ComposerSessionAttention`: the state name crosses, the
/// palette is the composer's. Kept in step by hand with `PULL_REQUEST_STATUS`
/// in `screens/(authenticated)/workspace/[id]/utils/pullRequest/status.ts`,
/// which is where the rest of the app reads the same five colours from.
enum ComposerQuickKeysActionTint: String {
  case open
  case draft
  case queued
  case merged
  case closed

  var color: Color {
    switch self {
    case .open: Color(red: 0.00, green: 0.74, blue: 0.49)  // emerald-500
    case .draft: Color(white: 0.64)  // muted-foreground, dark
    case .queued: Color(red: 0.99, green: 0.60, blue: 0.00)  // amber-500
    case .merged: Color(red: 0.68, green: 0.27, blue: 1.00)  // purple-500
    case .closed: Color(red: 0.88, green: 0.31, blue: 0.31)  // destructive, dark
    }
  }
}
