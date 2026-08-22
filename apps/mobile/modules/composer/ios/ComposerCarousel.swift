import SwiftUI

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
    // The badge sits fully inside the thumbnail's top-right corner, over the
    // image, rather than hanging off it.
    ZStack(alignment: .topTrailing) {
      Group {
        if attachment.isImage, let url = URL(string: attachment.uri) {
          AsyncImage(url: url) { image in
            image.resizable().aspectRatio(contentMode: .fill)
          } placeholder: {
            Color.white.opacity(0.08)
          }
        } else {
          Image(systemName: "doc.fill")
            .font(.system(size: 22))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.white.opacity(0.08))
        }
      }
      .frame(
        width: ComposerMetrics.thumbnailSize,
        height: ComposerMetrics.thumbnailSize
      )
      .clipShape(.rect(cornerRadius: ComposerMetrics.thumbnailRadius))
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
          .background(.black.opacity(0.45), in: .circle)
      }
      .buttonStyle(.plain)
      .padding(ComposerMetrics.removeBadgeInset)
      .accessibilityLabel("Remove attachment")
    }
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
          } else {
            Image(systemName: "doc.fill")
              .font(.system(size: 13))
              .foregroundStyle(.secondary)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
              .background(.white.opacity(0.08))
          }
        }
        .frame(
          width: ComposerMetrics.miniThumbnailSize,
          height: ComposerMetrics.miniThumbnailSize
        )
        .clipShape(.rect(cornerRadius: ComposerMetrics.miniThumbnailRadius))

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
