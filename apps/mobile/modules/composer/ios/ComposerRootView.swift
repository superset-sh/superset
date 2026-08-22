import SwiftUI

/// Metrics read off the reference frames in
/// `apps/mobile/plans/20260821-native-composer.md`, converted from the 921-wide
/// render to points on a 440pt-wide screen. Tuned on device from here.
enum ComposerMetrics {
  static let horizontalMargin: CGFloat = 16
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
  /// Frame 4: growth clamps rather than filling the screen.
  static let maxLines = 12
  static let grabberSize = CGSize(width: 36, height: 5)
  static let modelIconSize: CGFloat = 16
  static let modelIconRadius: CGFloat = 4
  static let chipSpacing: CGFloat = 12
  /// Measured off frames 6 and 9. The badge sits *inside* the thumbnail, inset
  /// by roughly its own radius — an earlier pass had it bleeding outside the
  /// corner, and the thumbnails were a third too small and proportionally
  /// rounder than the reference.
  static let thumbnailSize: CGFloat = 80
  static let thumbnailRadius: CGFloat = 9
  static let removeBadgeSize: CGFloat = 17
  static let removeBadgeInset: CGFloat = 6
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
  /// How far the grabber has to travel before releasing dismisses.
  static let dismissThreshold: CGFloat = 40
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
        Spacer(minLength: 0)
        surface
          .padding(.horizontal, ComposerMetrics.horizontalMargin)
          .padding(.bottom, ComposerMetrics.bottomGap)
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
      if !focused { collapse() }
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
            .transition(.opacity)
        }
        if !model.attachments.isEmpty {
          ComposerCarousel(
            attachments: model.attachments,
            onRemove: { model.onRemoveAttachment?($0) },
            onOpen: { model.onAttachmentPress?($0) }
          )
          // Frame 6 leaves air between the strip and the first line of text;
          // without this the thumbnail sits right on the placeholder.
          .padding(.bottom, ComposerMetrics.textInset)
          .transition(.opacity)
        }
        editor
          .transition(.opacity)
      }
      controlRow
    }
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
      set: { model.draft = $0 }
    ), axis: .vertical)
      .lineLimit(1...ComposerMetrics.maxLines)
      .textInputAutocapitalization(.sentences)
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
      Button { model.onAttachmentsPress?() } label: {
        Image(systemName: "plus")
          .font(.system(size: 17, weight: .regular))
      }
      .buttonStyle(.composerControl)
      .accessibilityLabel("Add attachment")

      if !isExpanded {
        ComposerCollapsedAttachments(attachments: model.attachments)
      }

      middleBand

      // Hidden while sending: the spinner is the only thing that should be
      // moving, and the row closes up around it.
      if !model.isSending {
        Button { model.onDictatePress?() } label: {
          Image(systemName: "mic")
            .font(.system(size: 17, weight: .regular))
        }
        .buttonStyle(.composerControl)
        .accessibilityLabel("Dictate")
        .transition(.opacity)
      }

      if model.hasContent {
        sendButton
      }
    }
    .padding(ComposerMetrics.rowPadding)
    // Typing is what reveals send, and the mic slides left to make room. Both
    // fall out of one animation on the row: the transition fades send in, the
    // HStack's own layout carries the mic.
    .animation(.snappy(duration: 0.22), value: model.hasContent)
    .animation(.snappy(duration: 0.22), value: model.isSending)
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
    .buttonStyle(model.isSending ? .composerSending : .composerSend)
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
            Text(chip.label)
            Image(systemName: "chevron.down")
              .font(.system(size: 11, weight: .semibold))
          }
          .foregroundStyle(.secondary)
          .lineLimit(1)
        }
        .buttonStyle(.plain)
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, ComposerMetrics.textInset + ComposerMetrics.rowPadding)
    .padding(.bottom, ComposerMetrics.textInset)
  }
}
