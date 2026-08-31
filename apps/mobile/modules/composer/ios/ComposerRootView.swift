import SwiftUI

/// Metrics read off the reference frames in
/// `apps/mobile/plans/20260821-native-composer.md`, converted from the 921-wide
/// render to points on a 440pt-wide screen. Tuned on device from here.
enum ComposerMetrics {
  /// Measured off frame 1: the pill's left edge sits ~12pt in, not 16.
  static let horizontalMargin: CGFloat = 12
  /// Gap between the composer and the bottom safe area, per frame 1.
  static let bottomGap: CGFloat = 8
  static let pillRadius: CGFloat = 26
  static let cardRadius: CGFloat = 28
  /// Proportions taken from the reference crops rather than guessed: the
  /// circle is ~0.6 of the row's height and sits ~15% of that height in from
  /// the edge. Sizing the circle to the row with only 4pt of padding — the
  /// first attempt — reads as the controls being jammed against the sides.
  static let controlDiameter: CGFloat = 32
  static let rowSpacing: CGFloat = 8
  static let rowPadding: CGFloat = 8
  static let textInset: CGFloat = 8
  /// Measured off the reference frames, and deliberately different: the
  /// collapsed placeholder sits ~10pt from the `+` circle while the model
  /// picker sits ~15pt out — about 1.5x. A single shared inset makes the
  /// collapsed text look pushed away from the button it belongs beside.
  /// Both are totals; the row's own spacing is subtracted at the call site.
  static let previewGap: CGFloat = 10
  static let pickerGap: CGFloat = 15
  /// Frame 4: the expanded editor has a generous floor rather than growing up
  /// from one line — roughly four blank lines.
  static let editorMinHeight: CGFloat = 96
  /// Frame 4: growth clamps rather than filling the screen. This is the whole
  /// bound — `lineLimit(1...n)` grows the field to n lines and scrolls after.
  /// A `.frame(maxHeight:)` is *not* the way to cap it: a max height makes the
  /// field expand to fill that height instead of hugging its content, which
  /// leaves an empty card the size of the cap.
  static let maxLines = 8
  static let grabberSize = CGSize(width: 36, height: 5)
  /// The chips and the model picker, measured off frames 4 and 10: the
  /// reference's chrome is ~14pt, not the 17pt body every `Text` inherits by
  /// default. The editor stays at the body size — that one already matches.
  static let chromeFontSize: CGFloat = 14
  /// Gap under the header row, measured rather than reused from `textInset`.
  /// The reference puts 19pt between the chips' ink and the first line of the
  /// draft; 17pt chrome plus an 8pt inset gave 30pt. Dropping to 14pt chrome
  /// took ~11pt out of the line box on its own, so what is left to add is 7.
  static let headerBottomGap: CGFloat = 5
  static let modelIconSize: CGFloat = 16
  static let chipSpacing: CGFloat = 12
  /// The quick-key strip, matching the gap the React Native composer used
  /// between its `above` cluster and the pill.
  static let quickKeyGap: CGFloat = 10
  /// Air between the slash panel and the top of the overlay. The overlay is a
  /// child of the screen's own view controller, so its top edge already sits
  /// below the navigation header — this is a breathing gap, not a header
  /// allowance. The panel fills everything from here to the quick keys.
  static let composerTopReserve: CGFloat = 8
  static let slashPanelRadius: CGFloat = 20
  static let slashPanelInset: CGFloat = 6
  static let slashRowVerticalPadding: CGFloat = 10
  static let slashDescriptionFontSize: CGFloat = 12
  /// Keys sit inside one surface now, so they are packed tighter than nine
  /// separate chips could be — the spacing here is between keys, not between
  /// backdrops.
  static let quickKeySpacing: CGFloat = 1
  static let quickKeyGlyphSize: CGFloat = 13
  static let quickKeyMinWidth: CGFloat = 22
  /// The shared surface: its corner and the inset holding the keys off its edge.
  /// The bar hugs whatever the keys need plus that inset on every side — it is
  /// no longer pinned to the key height, which left a pressed key exactly as
  /// tall as its container with nowhere to sit.
  static let quickKeyBarRadius: CGFloat = 11
  static let quickKeyBarInset: CGFloat = 4
  /// Concentric with the bar: a rounded rect inset by *n* inside another only
  /// looks nested if its radius is smaller by the same *n*. Derived rather than
  /// written down, so the two corners cannot drift apart.
  static let quickKeyRadius: CGFloat = quickKeyBarRadius - quickKeyBarInset
  static let quickKeyHeight: CGFloat = 28
  static let quickKeyPaddingH: CGFloat = 7
  static let quickKeyDividerHeight: CGFloat = 15
  /// Air either side of a group divider. The keys sit a hair apart from each
  /// other, so without this the hairline is as close to its neighbours as they
  /// are to each other and stops reading as a break between groups.
  static let quickKeyDividerGap: CGFloat = 4
  /// The edge fade, in unit space rather than points: the mask is a gradient
  /// laid out across the surface, and it has no geometry to read from.
  static let quickKeyFadeFraction: CGFloat = 0.07
  /// Slack before a scroll offset counts as "there is more that way", so a
  /// rubber-band overshoot does not flicker the fades.
  static let quickKeyScrollThreshold: CGFloat = 4

  /// The session tab strip, above the quick keys.
  ///
  /// One gap for the whole row: tab-to-tab, tab-to-`+`, `+`-to-grid, and the
  /// air the chevron leaves in front of the first tab are all this. The strip
  /// reads as one rhythm rather than as tabs with controls bolted on.
  static let sessionTabGap: CGFloat = 8
  static let sessionTabRadius: CGFloat = 8
  static let sessionTabPaddingH: CGFloat = 10
  static let sessionTabPaddingV: CGFloat = 5
  static let sessionTabIconGap: CGFloat = 6
  static let sessionTabFontSize: CGFloat = 12
  static let sessionTabMarkSize: CGFloat = 13
  /// A long branch name has to truncate rather than push the trailing controls
  /// off the row.
  static let sessionTabMaxLabelWidth: CGFloat = 128
  static let sessionTabDotSize: CGFloat = 6
  static let sessionTabCloseSize: CGFloat = 15
  /// The width the close disc occupies over the end of a selected tab: the
  /// glyph plus the air after it. It is overlaid, so it costs the pill no
  /// layout at all — this is only how far the title is faded out beneath it.
  static let sessionTabCloseSlot: CGFloat = sessionTabCloseSize + sessionTabPaddingV
  /// Softens the tail of a title too short to have truncated, where the disc
  /// necessarily sits over it.
  static let sessionTabCloseFade: CGFloat = 12
  static let sessionTabControlSize: CGFloat = 28
  static let sessionTabControlGlyph: CGFloat = 13
  static let sessionTabControlGap: CGFloat = sessionTabGap
  /// How far the strip scrolls before the scroll-home chevron is fully in.
  /// The reveal is a ratio of this, not a threshold crossing, so the control
  /// arrives with the content rather than popping once it has gone far enough.
  static let sessionTabChevronReveal: CGFloat = 32
  /// `.white.opacity(0.12)` composited over the app background, as an opaque
  /// colour. The scroll-home chevron overlays tabs that slide underneath it, so
  /// it cannot be translucent — but it still has to match the `+` and the grid
  /// beside it, which sit on the background and can be.
  static let sessionTabControlOpaque = Color(white: 0.155)
  static let sessionTabControlOpaquePressed = Color(white: 0.22)
  /// Where the scroll-home chevron stops covering the tabs, measured from the
  /// scroll view's own leading edge — the row margin is outside it now, so this
  /// is just the control plus one `sessionTabGap`. The air it leaves in front
  /// of the first tab is the same air between any two tabs.
  static let sessionTabChevronZone: CGFloat =
    sessionTabControlSize + sessionTabGap
  /// How far past that the tabs take to reach full opacity. The fade is what
  /// makes a tab sliding under the chevron look like it is going somewhere.
  static let sessionTabFadeWidth: CGFloat = 18
  /// Measured off frames 6 and 9. The badge sits *inside* the thumbnail, inset
  /// by roughly its own radius — an earlier pass had it bleeding outside the
  /// corner, and the thumbnails were a third too small and proportionally
  /// rounder than the reference.
  static let thumbnailSize: CGFloat = 80
  static let thumbnailRadius: CGFloat = 9
  /// Frame 10's non-image card: same height as a thumbnail, about twice as
  /// wide, because it has to carry a name as well as a mark.
  static let fileChipWidth: CGFloat = 159
  static let fileGlyphSize: CGFloat = 36
  static let fileGlyphRadius: CGFloat = 8
  static let fileChipInset: CGFloat = 7
  static let fileLabelSize: CGFloat = 12
  static let removeBadgeSize: CGFloat = 17
  static let removeBadgeInset: CGFloat = 6
  /// Transparent padding around the badge, because 17pt is less than half
  /// Apple's 44pt minimum and the mark cannot grow without leaving the
  /// reference. The outer inset is reduced by the same amount so the circle
  /// still sits where frames 6 and 9 put it — only the hit area moves.
  static let removeBadgeTouchPadding: CGFloat = 9
  static let carouselSpacing: CGFloat = 8
  /// Frames 7/9/11. `+N` is plain white text centred on the thumbnail, not a
  /// badge in a corner chip.
  static let miniThumbnailSize: CGFloat = 34
  static let miniThumbnailRadius: CGFloat = 7
  /// The draft preview and the model picker trade places through blur, matching
  /// the reference. `.transition(.blurReplace)` is the stock way to do this but
  /// only fires on insert/remove, and conditional insertion in that ZStack is
  /// what made the collapsed text slide vertically — so both stay laid out and
  /// their blur animates alongside their opacity instead.
  static let swapBlur: CGFloat = 6
  /// Content above the control row leaves much faster than the card shrinks.
  /// Fading it on the card's own curve leaves the chips and thumbnails legible
  /// most of the way down, so they read as still being part of the collapsed
  /// pill. Out early, in on the normal curve.
  static let contentFadeOut: Double = 0.09
  /// How far the grabber has to travel before releasing dismisses.
  static let dismissThreshold: CGFloat = 40

  /// The curve the card resizes on when its *content* changes — an attachment
  /// arriving or leaving, a chip row appearing.
  ///
  /// It has to be applied by opening a transaction around the mutation, never
  /// by hanging `.animation(_:value:)` on the surface. That modifier animates
  /// only the subtree it is attached to: the surface's own frame change is
  /// resolved by its parent, outside the modifier's scope, so the card snaps to
  /// its new height while the rows animate to new positions *inside* it — which
  /// is exactly the "everything slides" artefact this rewrite exists to remove.
  static let growth = Animation.snappy(duration: 0.3, extraBounce: 0.05)

  /// Faster and flat, because it fires mid-keystroke and has to settle before
  /// the next character lands.
  static let typingGrowth = Animation.snappy(duration: 0.16)

  /// Controls trading places in the bottom row — send arriving, the mic
  /// stepping aside, dictation taking the slot.
  static let controlSwap = Animation.snappy(duration: 0.22)
}

/// The composer's SwiftUI tree.
///
/// Collapsed shows a **read-only preview** of the draft; expanded shows the real
/// editor. They cross-fade — the standard chat-composer pattern — rather than
/// one field relocating between two positions. That is what removes the text
/// sliding across the surface mid-transition, and it sidesteps the identity
/// problem entirely: the collapsed state is a label, so there is no first
/// responder to lose.
///
/// The controls live in the bottom row of a bottom-anchored stack, so they hold
/// their position while everything above them grows and shrinks. Nothing moves.
struct ComposerRootView: View {
  let model: ComposerModel
  /// Mirrors `isFocused`, and cannot simply be replaced by it.
  ///
  /// Closing is driven entirely by focus — everything that dismisses resigns
  /// first responder and this follows. Opening cannot be: the editor only
  /// exists while expanded, and SwiftUI drops focus set on a view that is not
  /// in the tree, so focusing to open would never take. `expand()` therefore
  /// leads, and the editor claims focus once it appears.
  @State private var isExpanded = false
  @FocusState private var isFocused: Bool
  @State private var dragOffset: CGFloat = 0
  /// Window coordinates. Collapsed only the pill takes touches, so the list
  /// behind stays usable; expanded the composer owns the screen, because the
  /// backdrop has to catch the outside tap that dismisses it — a React Native
  /// view underneath cannot resign a SwiftUI first responder.
  @State private var surfaceFrame: CGRect = .zero
  @State private var rootFrame: CGRect = .zero
  /// Global top of the quick-keys+card cluster, for sizing the slash panel:
  /// its height is computed from real geometry rather than negotiated with
  /// the stack — a Spacer and a ScrollView are both greedy, and every
  /// priority arrangement still split the leftover between them.
  @State private var clusterTopY: CGFloat = 0
  /// The attachment open full screen, if any.
  @State private var viewing: ComposerAttachment?

  /// Things the composer itself put on screen that take first responder away
  /// from the editor. While one is up, losing focus is not the user dismissing
  /// the composer, and closing underneath them would be wrong.
  private var holdsOpen: Bool { model.dictation.isActive || viewing != nil }

  private func expand() {
    withAnimation(.snappy(duration: 0.3, extraBounce: 0.05)) { isExpanded = true }
  }

  private func collapse() {
    isFocused = false
    withAnimation(.snappy(duration: 0.3, extraBounce: 0.05)) { isExpanded = false }
  }

  var body: some View {
    ZStack {
      backdrop
      VStack(spacing: 0) {
        // A floor, not a gap: the suggestion panel is the only thing that can
        // grow the cluster toward the top, and this is what stops it there.
        Spacer(minLength: ComposerMetrics.composerTopReserve)
        // The quick keys ride with the card rather than sitting beside it: one
        // stack, one spacing, one transaction. As a sibling laid out by React
        // Native the gap had to guess the card's height and drifted every time
        // it grew — see `ComposerQuickKeys`.
        //
        // Two stacks on purpose. The outer one reports the interactive frame
        // and holds the slash panel, so taps on it pass the hit test; the
        // inner one reports the height the terminal insets by. Folding them
        // together would grow the terminal's margin every time the panel
        // opens, reflowing the scrollback under a transient menu.
        VStack(spacing: ComposerMetrics.quickKeyGap) {
          if isExpanded, let suggestions = model.slashSuggestions {
            ComposerSlashSuggestions(
              state: suggestions,
              // Everything between the header reserve and the cluster,
              // measured off real frames. dragOffset is subtracted so the
              // panel does not inflate while the card is being dragged away.
              availableHeight: max(
                0,
                (clusterTopY - dragOffset) - rootFrame.minY
                  - ComposerMetrics.composerTopReserve
                  - ComposerMetrics.quickKeyGap
              )
            ) { command in
              model.commitSlashCommand(command)
            }
            .padding(.horizontal, ComposerMetrics.horizontalMargin)
            .transition(.composerContent)
          }
          VStack(spacing: ComposerMetrics.quickKeyGap) {
            // Above the keys, inside the same stack, so the whole cluster —
            // tabs, keys, card — is one layout the keyboard moves as one. It
            // is also what keeps the terminal's inset honest: the height
            // reported below is measured off this stack, so a tab strip
            // appearing is already in the number the caller insets by.
            if !model.sessionTabs.isEmpty {
              ComposerSessionTabs(
                tabs: model.sessionTabs,
                labels: model.sessionTabLabels,
                onSelect: { model.onSessionTabPress?($0) },
                onClose: { model.onSessionTabClose?($0) },
                onCopyId: { model.onSessionTabCopyId?($0) },
                onNewSession: { model.onNewSessionPress?() },
                onAllSessions: { model.onAllSessionsPress?() }
              )
            }
            if !model.quickKeys.isEmpty {
              ComposerQuickKeys(keys: model.quickKeys) { model.onQuickKeyPress?($0) }
            }
            surface
              .padding(.horizontal, ComposerMetrics.horizontalMargin)
          }
          .padding(.bottom, ComposerMetrics.bottomGap)
          // Its own size, not its position — the keyboard moves this cluster
          // but does not resize it, so the caller gets a value that only
          // changes when the composer genuinely grows.
          .onGeometryChange(for: CGFloat.self) { $0.size.height }
            action: { model.onHeightChange?($0) }
          .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY }
            action: { clusterTopY = $0 }
        }
        .offset(y: dragOffset)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) }
          action: { surfaceFrame = $0 }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) }
      action: { rootFrame = $0 }
    // Catches the keyboard leaving by a route we did not initiate — the
    // interactive swipe-down, a hardware Esc, the system reclaiming first
    // responder — so the composer does not sit open with no keyboard under it.
    //
    // Deliberately one-directional. Mirroring `isExpanded = focused` here reads
    // tidier and breaks opening: `expand()` shows the editor, the editor claims
    // focus in `onAppear`, and that re-entrant change lands back here mid-update
    // and knocks `isExpanded` straight back down. Closing follows focus;
    // opening leads it.
    .onChange(of: isFocused) { _, focused in
      // Dictation and the image viewer are the exceptions: both take first
      // responder — one by activating a recording session, the other by
      // presenting full screen — and treating that as a dismissal would close
      // the composer underneath the thing it just opened.
      if !focused && !holdsOpen { collapse() }
    }
    // Whichever of them finished, put the caret back so the draft can be
    // carried on without tapping in again. The composer never closed, so this
    // is the keyboard returning to a card that stayed open.
    .onChange(of: holdsOpen) { _, holds in
      if !holds && isExpanded { isFocused = true }
    }
    .fullScreenCover(item: $viewing) { attachment in
      ComposerImageViewer(attachment: attachment) { viewing = nil }
    }
    .onChange(of: isExpanded) { publishInteractiveFrame() }
    .onChange(of: model.backdrop) { publishInteractiveFrame() }
    .onChange(of: isExpanded) { _, expanded in model.onExpandedChange?(expanded) }
    // Presenting a sheet over the composer resigns first responder, which
    // collapses it. The caller re-opens it once the sheet is gone, so the
    // keyboard and the draft come back rather than the user having to tap in
    // again.
    .onChange(of: model.focusRequest) { expand() }
    .onChange(of: model.blurRequest) { collapse() }
    .onChange(of: surfaceFrame) { publishInteractiveFrame() }
    .onChange(of: rootFrame) { publishInteractiveFrame() }
  }

  /// In `.dim` the composer claims the whole screen while expanded so the
  /// backdrop can catch the dismissing tap. In `.passthrough` it never claims
  /// more than its own surface, which is what leaves the content behind
  /// scrollable while the keyboard is up.
  private func publishInteractiveFrame() {
    let claimsScreen = isExpanded && model.backdrop == .dim
    model.onInteractiveFrameChange?(claimsScreen ? rootFrame : surfaceFrame)
  }

  private var backdrop: some View {
    let dims = isExpanded && model.backdrop == .dim
    return Color.black
      .opacity(dims ? 0.4 : 0)
      .ignoresSafeArea()
      .contentShape(.rect)
      .onTapGesture { collapse() }
      .allowsHitTesting(dims)
  }

  // MARK: - Surface

  private var surface: some View {
    VStack(spacing: 0) {
      if isExpanded {
        grabber
        if !model.headerChips.isEmpty {
          headerRow
            .transition(.composerContent)
        }
        if !model.attachments.isEmpty {
          ComposerCarousel(
            attachments: model.attachments,
            onRemove: { model.onRemoveAttachment?($0) },
            onOpen: open
          )
          // Frame 6 leaves air between the strip and the first line of text;
          // without this the thumbnail sits right on the placeholder.
          .padding(.bottom, ComposerMetrics.textInset)
          .transition(.composerContent)
        }
        editor
          .transition(.composerContent)
      }
      controlRow
    }
    // Nothing animates the card's size from here. Growth is driven by whoever
    // makes the change opening a transaction around it — the editor's binding
    // for text, the module's prop setters for everything React Native owns —
    // because only a real transaction reaches the parent that positions this
    // surface. See `ComposerMetrics.growth`.
    // One glass sheet for the whole composer. Controls inside it sit on solid
    // fills rather than more glass — see `ComposerControlStyle`.
    .glassEffect(
      .regular.interactive(),
      in: .rect(
        cornerRadius: isExpanded
          ? ComposerMetrics.cardRadius
          : ComposerMetrics.pillRadius
      )
    )
    .contentShape(.rect)
    // Collapsed, the whole pill is a hit target that opens the composer.
    // Expanded, it puts the caret back rather than re-running the expansion.
    .onTapGesture {
      if isExpanded { isFocused = true } else { expand() }
    }
  }

  /// Images open in the composer's own viewer; anything else is reported out,
  /// because only the app knows what to do with a document.
  private func open(_ id: String) {
    guard let attachment = model.attachments.first(where: { $0.id == id }) else { return }
    if attachment.isImage {
      viewing = attachment
    } else {
      model.onAttachmentPress?(id)
    }
  }

  private var grabber: some View {
    Capsule()
      .fill(.white.opacity(0.25))
      .frame(
        width: ComposerMetrics.grabberSize.width,
        height: ComposerMetrics.grabberSize.height
      )
      .padding(.vertical, 8)
      // A wide, invisible target so the handle is actually grabbable, and the
      // whole strip drags rather than just the 5pt capsule.
      .frame(maxWidth: .infinity)
      .contentShape(.rect)
      // High priority so it beats the surface's tap gesture, which wraps this
      // view and would otherwise win arbitration and swallow the drag.
      .highPriorityGesture(dismissDrag)
      .accessibilityLabel("Dismiss")
  }

  /// Drag down to dismiss. The surface tracks the finger while the gesture is
  /// live and springs back if released short of the threshold, so the handle
  /// behaves the way its shape promises.
  private var dismissDrag: some Gesture {
    DragGesture(minimumDistance: 1)
      .onChanged { value in
        dragOffset = max(0, value.translation.height)
      }
      .onEnded { value in
        let shouldDismiss = value.translation.height
          + value.predictedEndTranslation.height / 2
          > ComposerMetrics.dismissThreshold
        withAnimation(.snappy(duration: 0.25)) { dragOffset = 0 }
        if shouldDismiss { collapse() }
      }
  }

  private var editor: some View {
    TextField(model.placeholder, text: Binding(
      get: { model.draft },
      set: { text in
        model.setDraft(text)
      }
    ), axis: .vertical)
      .lineLimit(1...ComposerMetrics.maxLines)
      .textInputAutocapitalization(model.autocapitalization)
      .focused($isFocused)
      // The editor exists only while expanded, so this is the first moment it
      // can take first responder.
      .onAppear { isFocused = true }
      .frame(minHeight: ComposerMetrics.editorMinHeight, alignment: .top)
      .padding(.horizontal, ComposerMetrics.textInset + ComposerMetrics.rowPadding)
      .padding(.bottom, ComposerMetrics.textInset)
  }

  // MARK: - Control row

  private var controlRow: some View {
    HStack(spacing: ComposerMetrics.rowSpacing) {
      if model.showsAttachments {
        Button { model.onAttachmentsPress?() } label: {
          Image(systemName: "plus")
            .font(.system(size: 17, weight: .regular))
        }
        .buttonStyle(.composerControl)
        .accessibilityLabel("Add attachment")
      }

      if !isExpanded {
        ComposerCollapsedAttachments(attachments: model.attachments)
      }

      middleBand

      // The trigger slot: mic, or whatever dictation has turned it into.
      // Hidden while sending — the spinner should be the only thing moving.
      if !model.isSending {
        voiceControl
      }

      // Dictation owns the row while it runs, so send stays out of the way
      // rather than competing with the recording pill.
      if model.hasContent && !model.isDictating {
        sendButton
      }
    }
    .padding(ComposerMetrics.rowPadding)
    // The row resolves its position as one unit. Without this its children
    // inherit the card's *interpolating* geometry while it resizes, so a
    // control that arrives mid-resize — send, the moment a draft exists —
    // animates in from where the row used to be rather than fading in where it
    // belongs, and the mic beside it traces a curve instead of sliding.
    .geometryGroup()
    // Deliberately no `.animation(_:value:)` here. Typing reveals send and
    // slides the mic left at the same moment the card may be resizing, and a
    // modifier on this row would drive the mic's *horizontal* motion on its own
    // curve while the card's transaction drove its *vertical* motion on
    // another. Two curves on one control is a control travelling along an arc.
    // Every mutation that moves this row opens its own transaction instead —
    // see `ComposerModel.setDraft`, `ComposerDictation.setState`, and the
    // module's prop setters.
  }

  @ViewBuilder
  private var voiceControl: some View {
    switch model.dictation.state {
    case .recording(let startedAt):
      ComposerVoicePill(
        startedAt: startedAt,
        levels: model.dictation.levels,
        onStop: { model.dictation.stop() }
      )
      .transition(.opacity)
    case .preparing, .finalizing:
      Button(action: {}) {
        ComposerSpinner()
      }
      .buttonStyle(.composerControl)
      .disabled(true)
      .accessibilityLabel("Transcribing")
      .transition(.opacity)
    case .idle:
      Button { model.dictation.start() } label: {
        Image(systemName: "mic")
          .font(.system(size: 17, weight: .regular))
      }
      .buttonStyle(.composerControl)
      .accessibilityLabel("Dictate")
      .transition(.opacity)
    }
  }

  private var sendButton: some View {
    Button { model.submit() } label: {
      if model.isSending {
        ComposerSpinner()
      } else {
        Image(systemName: "arrow.up")
          .font(.system(size: 16, weight: .semibold))
      }
    }
    // In flight the button drops back to the ordinary control fill, so the
    // spinner sits on the same grey as the mic and `+` beside it. Keeping the
    // white fill would leave a bright disc that still reads as "ready".
    .buttonStyle(model.isSending ? .composerControl : .composerSend)
    .disabled(model.isSending)
    .accessibilityLabel(model.isSending ? "Sending" : "Send")
    .transition(.opacity)
  }

  /// The band between `+` and the trailing controls. Collapsed it holds the
  /// draft preview; expanded the editor has taken the text away, so the model
  /// picker takes its place. Two views cross-fading, never one view moving.
  private var middleBand: some View {
    // Both are always laid out and only their opacity changes. Inserting and
    // removing them instead lets SwiftUI animate the survivor's position as the
    // stack resolves, which reads as the collapsed text sliding vertically —
    // a smaller version of the translation this rewrite exists to remove.
    ZStack(alignment: .leading) {
      draftPreview
        .blur(radius: isExpanded ? ComposerMetrics.swapBlur : 0)
        .opacity(isExpanded ? 0 : 1)
        .accessibilityHidden(isExpanded)
      modelPicker
        .blur(radius: isExpanded ? 0 : ComposerMetrics.swapBlur)
        .opacity(isExpanded ? 1 : 0)
        .accessibilityHidden(!isExpanded)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .frame(height: ComposerMetrics.controlDiameter)
  }

  /// Frame 5: collapsing shows the head of the draft on one line,
  /// tail-truncated. It is a summary, not a viewport — no caret, no scroll
  /// offset, and not editable. Tapping it expands the composer.
  private var draftPreview: some View {
    Text(model.hasDraft ? model.draft : model.placeholder)
      .foregroundStyle(model.hasDraft ? .primary : .secondary)
      .lineLimit(1)
      .truncationMode(.tail)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.leading, ComposerMetrics.previewGap - ComposerMetrics.rowSpacing)
      .padding(.trailing, ComposerMetrics.textInset)
      .contentShape(.rect)
      .onTapGesture { expand() }
  }

  private var modelPicker: some View {
    ComposerModelPicker(
      selected: model.selectedModel,
      onPress: { model.onModelPress?() }
    )
    .padding(.leading, ComposerMetrics.pickerGap - ComposerMetrics.rowSpacing)
    .padding(.trailing, ComposerMetrics.textInset)
  }

  /// Frame 4: `superset main ⌄` · `☁ Cloud ⌄`, above the editor. Absent on the
  /// session surface (frame 13), which is simply an empty array.
  private var headerRow: some View {
    HStack(spacing: ComposerMetrics.chipSpacing) {
      ForEach(model.headerChips) { chip in
        Button { model.onChipPress?(chip.id) } label: {
          HStack(spacing: 4) {
            if chip.hasIcon {
              ComposerOptionIcon(option: chip)
                .padding(.trailing, 2)
            }
            Text(chip.label)
              .font(.system(size: ComposerMetrics.chromeFontSize))
              // The project is the subject and the branch qualifies it, which
              // is the split the reference draws. Everything reading the same
              // weight makes the row look like one long string.
              .foregroundStyle(chip.muted ? AnyShapeStyle(.secondary) : AnyShapeStyle(.primary))
            Image(systemName: "chevron.down")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(.secondary)
          }
          .lineLimit(1)
        }
        .buttonStyle(.plain)
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, ComposerMetrics.textInset + ComposerMetrics.rowPadding)
    .padding(.bottom, ComposerMetrics.headerBottomGap)
  }
}
