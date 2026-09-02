import SwiftUI

/// The workspace's sessions as a browser-style tab strip, directly above the
/// quick keys.
///
/// Native, and for the same reason the quick keys are: this strip's position
/// depends on the composer's own height, which only exists on this side of the
/// bridge. As a React Native sibling it would sit at `composerBottom +
/// composerHeight` and drift every time the card grew — the exact failure
/// `ComposerQuickKeys` was moved here to fix.
///
/// Behaviour stays in React Native. Selecting, closing, copying an id and
/// opening either sheet are all reported out by id; this view knows nothing
/// about terminals.
struct ComposerSessionTabs: View {
  let tabs: [ComposerSessionTab]
  let labels: ComposerSessionTabLabels
  /// The strip's one leading control, or nothing. Absent on every surface that
  /// has no link to offer.
  let action: ComposerSessionAction?
  let onSelect: (String) -> Void
  let onClose: (String) -> Void
  let onCopyId: (String) -> Void
  let onAction: () -> Void
  let onNewSession: () -> Void
  let onAllSessions: () -> Void

  /// How far the strip has scrolled. Kept as the raw offset rather than as a
  /// "has it moved" flag: the chevron and the fade under it are driven straight
  /// off it, so they track the finger instead of snapping on at a threshold.
  @State private var scrollX: CGFloat = 0

  /// 0 at the start of the strip, 1 once the chevron is fully in.
  private var reveal: CGFloat {
    min(1, max(0, scrollX / ComposerMetrics.sessionTabChevronReveal))
  }

  var body: some View {
    HStack(spacing: ComposerMetrics.sessionTabControlGap) {
      // Ahead of the scroll view, so it holds still while the tabs move under
      // the thumb — the whole point of putting it here rather than in the bar.
      // The scroll-home chevron overlays the strip's own leading edge, so once
      // the row has scrolled the two sit side by side.
      if let action {
        control(
          symbol: action.symbol,
          label: action.label,
          tint: ComposerSessionActionTint(rawValue: action.tint ?? "")?.color,
          iconUri: action.iconUri,
          action: onAction
        )
      }
      ScrollViewReader { proxy in
        ScrollView(.horizontal) {
          HStack(spacing: ComposerMetrics.sessionTabGap) {
            ForEach(tabs) { tab in
              ComposerSessionTabPill(
                tab: tab,
                labels: labels,
                onSelect: { onSelect(tab.id) },
                onClose: { onClose(tab.id) },
                onCopyId: { onCopyId(tab.id) }
              )
              .id(tab.id)
            }
          }
        }
        .scrollIndicators(.hidden)
        // No animation wrapper: the value *is* the scroll position, so the
        // reveal is already as smooth as the gesture driving it.
        .onScrollGeometryChange(for: CGFloat.self) { geometry in
          geometry.contentOffset.x
        } action: { _, offset in
          // Clamped, so the value stops changing once the chevron is fully in.
          // Unclamped this published a new offset on every frame of every
          // scroll, re-running the whole strip's body — and every pill measures
          // its title in there — for a `reveal` that was already pinned at 1.
          scrollX = min(offset, ComposerMetrics.sessionTabChevronReveal)
        }
        // Masks the tabs, never the chevron — hence before the overlay, not
        // after. A tab passing behind the control fades out instead of being
        // guillotined by its edge.
        .mask(tabsMask)
        // Overlaid rather than inserted into the row: appearing in the layout
        // would shift every tab sideways under a thumb that is mid-reach. The
        // tabs scroll underneath it, so its fill is opaque — there is no backing
        // here to fade them into, the terminal is live behind this cluster.
        .overlay(alignment: .leading) {
          control(symbol: "chevron.left", label: labels.scrollToStart, opaque: true) {
            guard let first = tabs.first else { return }
            withAnimation(.snappy(duration: 0.28)) {
              proxy.scrollTo(first.id, anchor: .leading)
            }
          }
          // Opacity only — it belongs at this spot in the row, so sliding it in
          // from the side would be motion that means nothing.
          .opacity(reveal)
          .allowsHitTesting(reveal > 0.5)
          .accessibilityHidden(reveal < 0.5)
        }
      }
      control(symbol: "plus", label: labels.newSession, action: onNewSession)
      control(symbol: "square.grid.2x2", label: labels.allSessions, action: onAllSessions)
    }
    // On the row, not on the scrolling content. Inside the scroll view the
    // margin scrolled away with the tabs — they ended up flush against the
    // screen edge, and `scrollTo(.leading)` came to rest at the padding rather
    // than at a true zero offset.
    .padding(.horizontal, ComposerMetrics.horizontalMargin)
  }

  /// A hole that opens under the chevron as the strip scrolls, in step with the
  /// chevron fading in over it. At rest the whole mask is opaque, so a strip
  /// sitting at its start has no fade on it at all.
  private var tabsMask: some View {
    let hole = Color.black.opacity(1 - reveal)
    return HStack(spacing: 0) {
      hole.frame(width: ComposerMetrics.sessionTabChevronZone)
      LinearGradient(colors: [hole, .black], startPoint: .leading, endPoint: .trailing)
        .frame(width: ComposerMetrics.sessionTabFadeWidth)
      Color.black
    }
  }

  /// The strip's trailing buttons and its scroll-home chevron: same square
  /// chip, so the row reads as one set of controls rather than three
  /// unrelated ones.
  private func control(
    symbol: String,
    label: String,
    opaque: Bool = false,
    tint: Color? = nil,
    iconUri: String? = nil,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      glyph(symbol: symbol, iconUri: iconUri)
        // On the label, not on the button: the style below paints
        // `.primary` on whatever it is handed, and the inner style wins.
        .foregroundStyle(tint.map { AnyShapeStyle($0) } ?? AnyShapeStyle(.primary))
    }
    .buttonStyle(ComposerSessionTabControlStyle(opaque: opaque))
    .accessibilityLabel(label)
  }

  /// The bundled mark when one has resolved, the SF Symbol until then.
  ///
  /// Templated rather than drawn as-is, so a one-colour mark takes the tint the
  /// symbol would have — the art carries the shape, this side carries the
  /// palette, the same split as everywhere else in the strip.
  @ViewBuilder
  private func glyph(symbol: String, iconUri: String?) -> some View {
    if let uri = iconUri, !uri.isEmpty, let url = URL(string: uri) {
      AsyncImage(url: url) { image in
        image
          .renderingMode(.template)
          .resizable()
          .aspectRatio(contentMode: .fit)
      } placeholder: {
        // The symbol rather than blank, so the chip does not flash empty on
        // the frame before the file lands.
        symbolGlyph(symbol)
      }
      .frame(
        width: ComposerMetrics.sessionTabControlMark,
        height: ComposerMetrics.sessionTabControlMark
      )
    } else {
      symbolGlyph(symbol)
    }
  }

  private func symbolGlyph(_ symbol: String) -> some View {
    Image(systemName: symbol)
      .font(.system(size: ComposerMetrics.sessionTabControlGlyph, weight: .semibold))
  }
}

/// One tab.
///
/// Two buttons inside one pill rather than a button inside a button: a `Button`
/// nested in another `Button`'s label is inert, so the close disc would never
/// receive the tap it exists for.
private struct ComposerSessionTabPill: View {
  let tab: ComposerSessionTab
  let labels: ComposerSessionTabLabels
  let onSelect: () -> Void
  let onClose: () -> Void
  let onCopyId: () -> Void

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: ComposerMetrics.sessionTabRadius, style: .continuous)
  }

  /// What the title would render at with no cap on it.
  private var titleIdealWidth: CGFloat {
    let font = UIFont.systemFont(
      ofSize: ComposerMetrics.sessionTabFontSize,
      weight: .medium
    )
    return (tab.label as NSString)
      .size(withAttributes: [.font: font])
      .width
      .rounded(.up)
  }

  /// Exactly how much width the title gives up by being selected — which is
  /// how much has to be handed back so the pill does not move.
  ///
  /// A constant would be wrong: only a title long enough to hit its cap loses
  /// the full slot. A short one loses nothing, so it gets nothing back and the
  /// disc simply sits over its tail. Either way the pill is the same width
  /// selected or not, which is the only thing the eye tracks in a row of tabs.
  private var closeCompensation: CGFloat {
    guard tab.selected else { return 0 }
    let cap = ComposerMetrics.sessionTabMaxLabelWidth
    let unselected = min(titleIdealWidth, cap)
    let selected = min(titleIdealWidth, cap - ComposerMetrics.sessionTabCloseSlot)
    return unselected - selected
  }

  var body: some View {
    Button(action: onSelect) {
      HStack(spacing: ComposerMetrics.sessionTabIconGap) {
        ComposerSessionMark(tab: tab)
        Text(tab.label)
          .font(.system(size: ComposerMetrics.sessionTabFontSize, weight: .medium))
          .lineLimit(1)
          .truncationMode(.tail)
          // The disc's width is known, so the title just gives it up and
          // truncates — the ellipsis lands clear of the glyph instead of under
          // it. The same width comes straight back as trailing padding below,
          // so the pill itself does not move.
          .frame(
            maxWidth: ComposerMetrics.sessionTabMaxLabelWidth
              - (tab.selected ? ComposerMetrics.sessionTabCloseSlot : 0),
            alignment: .leading
          )
        if let dot = ComposerSessionAttention(rawValue: tab.attention ?? "") {
          ComposerSessionDot(attention: dot)
        }
      }
      .padding(.leading, ComposerMetrics.sessionTabPaddingH)
      // Exactly what the title gave up, handed back as space for the disc to
      // sit in. A tab whose title fills its allowance is therefore the same
      // width selected or not.
      .padding(.trailing, ComposerMetrics.sessionTabPaddingH + closeCompensation)
      .padding(.vertical, ComposerMetrics.sessionTabPaddingV)
      // Only bites when the title had nothing to give up and the disc ends up
      // over its tail; a title that truncated already stops short of the glyph,
      // so the gradient falls on padding and shows nothing.
      .mask(contentMask)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .foregroundStyle(tab.selected ? AnyShapeStyle(.primary) : AnyShapeStyle(.secondary))
    // On the button, not on the pill around it. A `Button` swallows the long
    // press before a `.contextMenu` on its ancestor ever sees it, so the menu
    // never opened when this hung off the enclosing stack.
    //
    // Close is here as well as on the disc: the disc only exists on the
    // selected tab, and closing one you are not looking at is the more common
    // want.
    .contextMenu {
      Button(action: onCopyId) {
        Label(labels.copyId, systemImage: "doc.on.doc")
      }
      Button(role: .destructive, action: onClose) {
        Label(labels.close, systemImage: "xmark")
      }
    }
    // Overlaid, so it takes no layout: a tab is exactly as wide selected as it
    // is unselected. Giving the disc a slot of its own is the obvious thing and
    // it is wrong twice over — reserve it on every tab and every tab that never
    // shows one carries the gap; reserve it only on the selected tab and the
    // whole strip shifts as you switch.
    .overlay(alignment: .trailing) {
      if tab.selected {
        Button(action: onClose) {
          // A filled disc with the x knocked out, not an outlined circle: the row
          // already carries a column of outlined brand marks, and a third
          // outline there reads as decoration rather than as the one control on
          // the tab.
          //
          // Monochrome on purpose. `.fill` symbols already draw their glyph as
          // negative space, so one colour gives the knockout for free — and
          // `.palette` here rendered nothing at all: the symbol has a single
          // layer, so palette fell back to monochrome using the *first* style,
          // which was the dark one meant for the x.
          Image(systemName: "xmark.circle.fill")
            .font(.system(size: ComposerMetrics.sessionTabCloseSize))
            .foregroundStyle(.white.opacity(0.38))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(labels.close)
        .padding(.trailing, ComposerMetrics.sessionTabPaddingV)
      }
    }
    .background(
      tab.selected ? AnyShapeStyle(.white.opacity(0.14)) : AnyShapeStyle(.white.opacity(0.06)),
      in: shape
    )
  }

  @ViewBuilder
  private var contentMask: some View {
    if tab.selected {
      HStack(spacing: 0) {
        Color.black
        LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
          .frame(width: ComposerMetrics.sessionTabCloseFade)
        Color.clear.frame(width: ComposerMetrics.sessionTabCloseSlot)
      }
    } else {
      Color.black
    }
  }
}

/// The session's brand mark, or its initial when it has none — a plain shell
/// has no agent and therefore no logo.
///
/// Mirrors `ComposerOptionIcon`, fallback included, so a session reads the same
/// here as it does in the model picker.
private struct ComposerSessionMark: View {
  let tab: ComposerSessionTab

  private var size: CGFloat { ComposerMetrics.sessionTabMarkSize }

  var body: some View {
    if let uri = tab.iconUri, !uri.isEmpty, let url = URL(string: uri) {
      AsyncImage(url: url) { image in
        image.resizable().aspectRatio(contentMode: .fit)
      } placeholder: {
        // The initial rather than blank, so the pill's width does not jump
        // when the logo lands.
        initial
      }
      .frame(width: size, height: size)
    } else {
      initial.frame(width: size, height: size)
    }
  }

  private var initial: some View {
    Text(tab.initial)
      .font(.system(size: size * 0.62, weight: .bold))
      .foregroundStyle(.secondary)
  }
}

/// What a linked pull request's state colours the leading control, as it
/// reaches this side of the bridge.
///
/// Same split as `ComposerSessionAttention` below: the state name crosses, the
/// palette is the composer's. Kept in step by hand with `PULL_REQUEST_STATUS`
/// in `screens/(authenticated)/workspace/[id]/utils/pullRequest/status.ts`,
/// which is where the rest of the app reads the same five colours from.
enum ComposerSessionActionTint: String {
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

/// Desktop's StatusIndicator states, as they reach this side of the bridge.
enum ComposerSessionAttention: String {
  case permission
  case working
  case failed
  case review

  var color: Color {
    switch self {
    case .permission: Color(red: 0.92, green: 0.70, blue: 0.03)  // yellow-500
    case .working: Color(red: 0.96, green: 0.62, blue: 0.04)  // amber-500
    case .failed: Color(red: 0.94, green: 0.27, blue: 0.27)  // red-500
    case .review: Color(red: 0.13, green: 0.77, blue: 0.37)  // green-500
    }
  }

  /// Review is a finished state — it is static on desktop too. The rest are
  /// live and ping.
  var pings: Bool { self != .review }
}

/// The attention dot. A static dot for `review`, a pinging one for everything
/// still in motion, matching desktop's StatusIndicator.
private struct ComposerSessionDot: View {
  let attention: ComposerSessionAttention

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var ping = false

  private var size: CGFloat { ComposerMetrics.sessionTabDotSize }

  var body: some View {
    Circle()
      .fill(attention.color)
      .frame(width: size, height: size)
      .overlay {
        if attention.pings && !reduceMotion {
          Circle()
            .stroke(attention.color, lineWidth: 1.5)
            .scaleEffect(ping ? 2.6 : 1)
            .opacity(ping ? 0 : 0.7)
        }
      }
      .onAppear {
        guard attention.pings, !reduceMotion else { return }
        withAnimation(.easeOut(duration: 1.5).repeatForever(autoreverses: false)) {
          ping = true
        }
      }
  }
}

/// Press feedback for the strip's square chips.
///
/// Not `.glass`, for the reason `ComposerQuickKeys` spells out: this cluster
/// sits over a mostly-black scrollback, and a material meant to sample rich
/// content behind it has nothing to sample.
private struct ComposerSessionTabControlStyle: ButtonStyle {
  /// Opaque for the scroll-home chevron, which sits *over* tabs that slide
  /// underneath it — a translucent fill there shows the tab it is covering.
  /// The trailing controls sit on the background and stay translucent, so the
  /// opaque colour is that same fill pre-composited to match them exactly.
  var opaque = false

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .frame(
        width: ComposerMetrics.sessionTabControlSize,
        height: ComposerMetrics.sessionTabControlSize
      )
      .foregroundStyle(.primary)
      .background(
        opaque
          ? AnyShapeStyle(
            configuration.isPressed
              ? ComposerMetrics.sessionTabControlOpaquePressed
              : ComposerMetrics.sessionTabControlOpaque
          )
          : AnyShapeStyle(.white.opacity(configuration.isPressed ? 0.20 : 0.12)),
        in: .rect(cornerRadius: ComposerMetrics.sessionTabRadius, style: .continuous)
      )
      .animation(.snappy(duration: 0.18), value: configuration.isPressed)
      .contentShape(.rect)
  }
}
