import SwiftUI
import UIKit

/// Frame 12: an image attachment full screen, with ✕ and Done over it.
///
/// Presented by the composer rather than reported out to React Native. The
/// composer already holds the attachment's URI, so routing a tap across the
/// bridge only to have React Native push a screen that reads the same data back
/// is a round trip that buys nothing — and it would put a React Native screen
/// on top of a SwiftUI first responder, which is the arrangement the rest of
/// this rewrite exists to get rid of.
///
/// No markup pill: the reference has pencil and speech-bubble tools, and they
/// are explicitly out of scope. Both ✕ and Done therefore do the same thing —
/// they are the reference's cancel/confirm pair with nothing to cancel yet.
struct ComposerImageViewer: View {
  let attachment: ComposerAttachment
  let onClose: () -> Void

  @State private var image: UIImage?

  /// Measured off frame 12: 42px controls and a ~70px pill on the 414-wide
  /// render, which is 44pt and 74pt on the 440pt screen it was captured from.
  private static let controlSize: CGFloat = 44
  private static let chromeInset: CGFloat = 16
  /// The reference letterboxes rather than running the image to the edges.
  private static let imageInset: CGFloat = 16

  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()

      if let image {
        ComposerZoomableImage(image: image)
          .padding(.horizontal, Self.imageInset)
      } else {
        ProgressView().tint(.white.opacity(0.45))
      }

      VStack {
        HStack {
          Button(action: onClose) {
            Image(systemName: "xmark")
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(.white)
              .frame(width: Self.controlSize, height: Self.controlSize)
              .background(.white.opacity(0.12), in: .circle)
          }
          .accessibilityLabel("Close")

          Spacer()

          Button(action: onClose) {
            Text("Done")
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(.white)
              .padding(.horizontal, 18)
              .frame(height: Self.controlSize)
              .background(.white.opacity(0.12), in: .capsule)
          }
        }
        .buttonStyle(.plain)
        .padding(Self.chromeInset)

        Spacer()
      }
    }
    // Keyed on the URI so reopening a different attachment reloads rather than
    // showing the previous one until the new decode lands.
    .task(id: attachment.uri) { image = await Self.load(attachment.uri) }
  }

  /// Decoding a full-resolution photo takes long enough to drop frames on the
  /// presentation animation, so it happens off the main actor.
  private static func load(_ uri: String) async -> UIImage? {
    guard let url = URL(string: uri) else { return nil }
    return await Task.detached(priority: .userInitiated) {
      if url.isFileURL { return UIImage(contentsOfFile: url.path) }
      guard let data = try? Data(contentsOf: url) else { return nil }
      return UIImage(data: data)
    }.value
  }
}

/// Pinch, pan and double-tap zoom.
///
/// A `UIScrollView` rather than a `MagnificationGesture`: SwiftUI has no zoom
/// API, and hand-rolling one from gestures means reimplementing rubber-banding,
/// centring and momentum — all of which a scroll view already does the way iOS
/// users expect.
private struct ComposerZoomableImage: UIViewRepresentable {
  let image: UIImage

  func makeUIView(context: Context) -> UIScrollView {
    let scrollView = UIScrollView()
    scrollView.delegate = context.coordinator
    scrollView.minimumZoomScale = 1
    scrollView.maximumZoomScale = 6
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.showsVerticalScrollIndicator = false
    scrollView.backgroundColor = .clear
    scrollView.contentInsetAdjustmentBehavior = .never

    let imageView = UIImageView(image: image)
    imageView.contentMode = .scaleAspectFit
    imageView.frame = scrollView.bounds
    imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    scrollView.addSubview(imageView)
    context.coordinator.imageView = imageView

    let doubleTap = UITapGestureRecognizer(
      target: context.coordinator,
      action: #selector(Coordinator.handleDoubleTap(_:))
    )
    doubleTap.numberOfTapsRequired = 2
    scrollView.addGestureRecognizer(doubleTap)

    return scrollView
  }

  func updateUIView(_ scrollView: UIScrollView, context: Context) {
    guard context.coordinator.imageView?.image !== image else { return }
    context.coordinator.imageView?.image = image
    scrollView.setZoomScale(scrollView.minimumZoomScale, animated: false)
  }

  func makeCoordinator() -> Coordinator { Coordinator() }

  final class Coordinator: NSObject, UIScrollViewDelegate {
    var imageView: UIImageView?

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

    @objc func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
      guard let scrollView = recognizer.view as? UIScrollView else { return }
      guard scrollView.zoomScale <= scrollView.minimumZoomScale else {
        scrollView.setZoomScale(scrollView.minimumZoomScale, animated: true)
        return
      }
      // Zoom to a third of the frame around the tap, which lands at 3x and
      // keeps whatever was under the finger under the finger.
      let point = recognizer.location(in: imageView)
      let size = CGSize(
        width: scrollView.bounds.width / 3,
        height: scrollView.bounds.height / 3
      )
      scrollView.zoom(
        to: CGRect(
          origin: CGPoint(x: point.x - size.width / 2, y: point.y - size.height / 2),
          size: size
        ),
        animated: true
      )
    }
  }
}
