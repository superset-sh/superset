import SwiftUI

/// Lifts a thumbnail off the glass behind it.
///
/// There is no dedicated iOS API for this. The convention is a **gradient**
/// hairline rather than a flat one — a flat white stroke vanishes wherever the
/// content behind it is light — plus a shadow soft enough that the glass keeps
/// doing most of the depth work. Under Increase Contrast the system thickens
/// glass borders on its own, so this stays deliberately understated.
private struct ThumbnailEdge: ViewModifier {
  let radius: CGFloat

  func body(content: Content) -> some View {
    content
      .overlay {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
          .strokeBorder(
            LinearGradient(
              colors: [.white.opacity(0.35), .white.opacity(0.12)],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            ),
            lineWidth: 0.5
          )
      }
      .thumbnailShadow()
  }
}

private extension View {
  func thumbnailEdge(radius: CGFloat) -> some View {
    modifier(ThumbnailEdge(radius: radius))
  }

  /// The lift on its own, for things that need the depth but not the hairline.
  /// The remove badge is one: a rim light around a 17pt circle reads as a ring
  /// drawn on the badge rather than as its edge.
  func thumbnailShadow() -> some View {
    shadow(color: .black.opacity(0.18), radius: 4, y: 1)
  }
}

/// Frame 10: a full-bleed horizontal strip. The scroll view spans the card's
/// whole width while its *content* carries the inset, so a scrolled item runs
/// to the card's edge instead of stopping at an inner margin. Free scrolling —
/// no snapping — and adding an item never moves the offset.
struct ComposerCarousel: View {
  let attachments: [ComposerAttachment]
  let onRemove: (String) -> Void
  let onOpen: (String) -> Void

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: ComposerMetrics.carouselSpacing) {
        ForEach(attachments) { attachment in
          thumbnail(attachment)
        }
      }
      .padding(.horizontal, ComposerMetrics.textInset + ComposerMetrics.rowPadding)
    }
    .scrollIndicators(.hidden)
    .frame(height: ComposerMetrics.thumbnailSize)
  }

  private func thumbnail(_ attachment: ComposerAttachment) -> some View {
    // The badge sits fully inside the item's top-right corner, over the
    // content, rather than hanging off it.
    ZStack(alignment: .topTrailing) {
      Group {
        if attachment.isImage {
          image(attachment)
            .frame(
              width: ComposerMetrics.thumbnailSize,
              height: ComposerMetrics.thumbnailSize
            )
        } else {
          fileCard(attachment)
        }
      }
      .clipShape(.rect(cornerRadius: ComposerMetrics.thumbnailRadius, style: .continuous))
      .thumbnailEdge(radius: ComposerMetrics.thumbnailRadius)
      .contentShape(.rect)
      .onTapGesture { onOpen(attachment.id) }

      Button { onRemove(attachment.id) } label: {
        Image(systemName: "xmark")
          .font(.system(size: ComposerMetrics.removeBadgeSize * 0.55, weight: .bold))
          .foregroundStyle(.white)
          .frame(
            width: ComposerMetrics.removeBadgeSize,
            height: ComposerMetrics.removeBadgeSize
          )
          .background(.black.opacity(0.75), in: .circle)
          .thumbnailShadow()
          .padding(ComposerMetrics.removeBadgeTouchPadding)
          .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .padding(
        ComposerMetrics.removeBadgeInset - ComposerMetrics.removeBadgeTouchPadding
      )
      .accessibilityLabel("Remove attachment")
    }
  }

  @ViewBuilder
  private func image(_ attachment: ComposerAttachment) -> some View {
    if let url = URL(string: attachment.uri) {
      AsyncImage(url: url) { image in
        image.resizable().aspectRatio(contentMode: .fill)
      } placeholder: {
        Color.white.opacity(0.08)
      }
    } else {
      Color.white.opacity(0.08)
    }
  }

  /// Frame 10's non-image card. A square 80pt tile is the wrong shape for a
  /// document: every file draws the same glyph, so without room for a name the
  /// tray is a row of identical grey squares. The reference gives it a wider
  /// card — mark in the top-left, name truncating along the bottom.
  private func fileCard(_ attachment: ComposerAttachment) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      ComposerFileThumbnail(
        attachment: attachment,
        size: CGSize(
          width: ComposerMetrics.fileGlyphSize,
          height: ComposerMetrics.fileGlyphSize
        ),
        cornerRadius: ComposerMetrics.fileGlyphRadius
      )

      Spacer(minLength: 0)

      Text(attachment.name ?? "Document")
        .font(.system(size: ComposerMetrics.fileLabelSize))
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .truncationMode(.middle)
    }
    .padding(ComposerMetrics.fileChipInset)
    // Room for the remove badge, so a long name never runs under it.
    .padding(.trailing, ComposerMetrics.removeBadgeSize)
    .frame(
      width: ComposerMetrics.fileChipWidth,
      height: ComposerMetrics.thumbnailSize,
      alignment: .leading
    )
    .background(.white.opacity(0.05))
  }
}

/// Frames 7/9/11: collapsed keeps one thumbnail and a `+N` overflow badge, so
/// the pill's width is independent of how many attachments there are.
struct ComposerCollapsedAttachments: View {
  let attachments: [ComposerAttachment]

  var body: some View {
    if let first = attachments.first {
      ZStack {
        Group {
          if first.isImage, let url = URL(string: first.uri) {
            AsyncImage(url: url) { image in
              image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
              Color.white.opacity(0.08)
            }
            .frame(
              width: ComposerMetrics.miniThumbnailSize,
              height: ComposerMetrics.miniThumbnailSize
            )
          } else {
            // The same preview the expanded card shows, so collapsing does not
            // turn a recognisable document back into an anonymous glyph.
            ComposerFileThumbnail(
              attachment: first,
              size: CGSize(
                width: ComposerMetrics.miniThumbnailSize,
                height: ComposerMetrics.miniThumbnailSize
              ),
              cornerRadius: ComposerMetrics.miniThumbnailRadius
            )
          }
        }
        .clipShape(
          .rect(cornerRadius: ComposerMetrics.miniThumbnailRadius, style: .continuous)
        )
        .thumbnailEdge(radius: ComposerMetrics.miniThumbnailRadius)

        if attachments.count > 1 {
          Text("+\(attachments.count - 1)")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(.white)
            .shadow(radius: 2)
        }
      }
      .accessibilityLabel("\(attachments.count) attachments")
    }
  }
}
