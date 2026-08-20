import Photos
import SwiftUI
import UIKit

@available(iOS 16.0, *)
internal final class SheetModel: ObservableObject {
  let theme: SheetTheme
  var onAction: ((String) -> Void)?
  var onAdd: (([[String: Any]]) -> Void)?
  var onClose: (() -> Void)?

  @Published var status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
  @Published var recents: [PHAsset] = []
  @Published var screenshots: [PHAsset] = []
  @Published var selection: [PHAsset] = []
  @Published var isExporting = false

  var libraryUsable: Bool { status == .authorized || status == .limited }
  var canAskAgain: Bool { status == .notDetermined }

  init(theme: SheetTheme) {
    self.theme = theme
    loadIfUsable()
  }

  func requestAccess() {
    PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
      DispatchQueue.main.async {
        self.status = status
        self.loadIfUsable()
      }
    }
  }

  func loadIfUsable() {
    guard libraryUsable else { return }
    let byNewest = [NSSortDescriptor(key: "creationDate", ascending: false)]

    let recentOptions = PHFetchOptions()
    recentOptions.sortDescriptors = byNewest
    recentOptions.fetchLimit = 30
    recents = assetArray(PHAsset.fetchAssets(with: .image, options: recentOptions))

    let screenshotsAlbum = PHAssetCollection.fetchAssetCollections(
      with: .smartAlbum,
      subtype: .smartAlbumScreenshots,
      options: nil
    ).firstObject
    if let screenshotsAlbum {
      let screenshotOptions = PHFetchOptions()
      screenshotOptions.sortDescriptors = byNewest
      screenshots = assetArray(PHAsset.fetchAssets(in: screenshotsAlbum, options: screenshotOptions))
    }
  }

  func selectionIndex(of asset: PHAsset) -> Int? {
    selection.firstIndex { $0.localIdentifier == asset.localIdentifier }
  }

  func toggle(_ asset: PHAsset) {
    if let index = selectionIndex(of: asset) {
      selection.remove(at: index)
    } else {
      selection.append(asset)
    }
  }

  func addSelected() {
    guard !isExporting, !selection.isEmpty else { return }
    isExporting = true
    AssetExporter.export(selection) { [weak self] items in
      self?.isExporting = false
      self?.onAdd?(items)
    }
  }

  private func assetArray(_ result: PHFetchResult<PHAsset>) -> [PHAsset] {
    result.objects(at: IndexSet(0..<result.count))
  }
}

/// Exports assets as JPEG files in the temp directory — library assets are
/// often HEIC, which the agent API rejects.
private enum AssetExporter {
  static func export(_ assets: [PHAsset], completion: @escaping ([[String: Any]]) -> Void) {
    DispatchQueue.global(qos: .userInitiated).async {
      let items = assets.compactMap(exportOne)
      DispatchQueue.main.async { completion(items) }
    }
  }

  private static func exportOne(_ asset: PHAsset) -> [String: Any]? {
    let options = PHImageRequestOptions()
    options.isNetworkAccessAllowed = true
    options.deliveryMode = .highQualityFormat
    options.isSynchronous = true

    var image: UIImage?
    PHImageManager.default().requestImage(
      for: asset,
      targetSize: PHImageManagerMaximumSize,
      contentMode: .default,
      options: options
    ) { result, _ in
      image = result
    }
    guard let data = image?.jpegData(compressionQuality: 0.8) else { return nil }

    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("attachments", isDirectory: true)
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let file = directory.appendingPathComponent("\(UUID().uuidString).jpg")
    guard (try? data.write(to: file)) != nil else { return nil }

    let originalName = PHAssetResource.assetResources(for: asset)
      .first?.originalFilename
    let name = originalName.map {
      ($0 as NSString).deletingPathExtension.appending(".jpg")
    }
    return [
      "uri": file.absoluteString,
      "name": name ?? file.lastPathComponent,
      "mediaType": "image/jpeg",
      "size": data.count,
    ]
  }
}

@available(iOS 16.0, *)
internal struct AttachmentsSheetRootView: View {
  @ObservedObject var model: SheetModel

  var body: some View {
    NavigationStack {
      AttachmentsHomeView(model: model)
    }
    .tint(Color(model.theme.foreground))
  }
}

@available(iOS 16.0, *)
private struct AttachmentsHomeView: View {
  @ObservedObject var model: SheetModel

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if model.libraryUsable {
        RecentPhotosCarousel(model: model)
      } else {
        PermissionCard(model: model, message: "Attach images from your photo library.")
      }
      VStack(spacing: 0) {
        ActionRow(theme: model.theme, icon: "photo.on.rectangle", label: "Photos") {
          model.onAction?("photos")
        }
        NavigationLink {
          ScreenshotsGridView(model: model)
        } label: {
          RowLabel(theme: model.theme, icon: "viewfinder", label: "Screenshots", chevron: true)
        }
        .buttonStyle(.plain)
        ActionRow(theme: model.theme, icon: "camera", label: "Camera") {
          model.onAction?("camera")
        }
        ActionRow(theme: model.theme, icon: "doc", label: "Files") {
          model.onAction?("files")
        }
      }
      .padding(.horizontal, 20)
      .padding(.top, 16)
      Spacer(minLength: 0)
    }
    .padding(.top, 12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color(model.theme.background).ignoresSafeArea())
    .navigationTitle("Attachments")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .navigationBarLeading) {
        Button {
          model.onClose?()
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 15, weight: .semibold))
        }
      }
    }
    .overlay(alignment: .bottom) { AddSelectedBar(model: model) }
  }
}

@available(iOS 16.0, *)
private struct ScreenshotsGridView: View {
  @ObservedObject var model: SheetModel

  private let columns = 4
  private let gap: CGFloat = 6
  private let horizontalPadding: CGFloat = 20

  var body: some View {
    Group {
      if model.libraryUsable {
        GeometryReader { proxy in
          let side =
            (proxy.size.width - horizontalPadding * 2 - gap * CGFloat(columns - 1))
            / CGFloat(columns)
          ScrollView {
            LazyVGrid(
              columns: Array(
                repeating: GridItem(.flexible(), spacing: gap),
                count: columns
              ),
              spacing: gap
            ) {
              ForEach(model.screenshots, id: \.localIdentifier) { asset in
                SelectableThumbnail(model: model, asset: asset, side: side, badgeSize: 32)
              }
            }
            .padding(.horizontal, horizontalPadding)
            .padding(.bottom, 12)
            if model.screenshots.isEmpty {
              Text("No screenshots found")
                .font(.system(size: 14))
                .foregroundColor(Color(model.theme.mutedForeground))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
            }
          }
        }
      } else {
        VStack {
          PermissionCard(model: model, message: "Allow photo access to attach screenshots.")
          Spacer()
        }
        .padding(.top, 12)
      }
    }
    .background(Color(model.theme.background).ignoresSafeArea())
    .navigationTitle("Screenshots")
    .navigationBarTitleDisplayMode(.inline)
    .overlay(alignment: .bottom) { AddSelectedBar(model: model) }
    .onAppear {
      if model.canAskAgain {
        model.requestAccess()
      }
    }
  }
}

@available(iOS 16.0, *)
private struct RecentPhotosCarousel: View {
  @ObservedObject var model: SheetModel

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(model.recents, id: \.localIdentifier) { asset in
          SelectableThumbnail(model: model, asset: asset, side: 96, badgeSize: 36)
        }
        if model.recents.isEmpty {
          Text("No photos in your library")
            .font(.system(size: 14))
            .foregroundColor(Color(model.theme.mutedForeground))
            .frame(height: 96)
        }
      }
      .padding(.horizontal, 20)
    }
  }
}

@available(iOS 16.0, *)
private struct SelectableThumbnail: View {
  @ObservedObject var model: SheetModel
  let asset: PHAsset
  let side: CGFloat
  let badgeSize: CGFloat

  var body: some View {
    let index = model.selectionIndex(of: asset)
    Button {
      model.toggle(asset)
    } label: {
      AssetThumbnail(asset: asset, side: side)
        .opacity(index == nil ? 1 : 0.45)
        .overlay {
          if let index {
            ZStack {
              Circle()
                .fill(.white)
                .frame(width: badgeSize, height: badgeSize)
              Text("\(index + 1)")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.black)
            }
          }
        }
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(index == nil ? [] : .isSelected)
  }
}

@available(iOS 16.0, *)
private struct AssetThumbnail: View {
  let asset: PHAsset
  let side: CGFloat
  @Environment(\.displayScale) private var displayScale
  @State private var image: UIImage?
  @State private var requestId: PHImageRequestID?

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
      } else {
        Color.gray.opacity(0.15)
      }
    }
    .frame(width: side, height: side)
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .contentShape(RoundedRectangle(cornerRadius: 8))
    .onAppear(perform: load)
    .onDisappear(perform: cancel)
  }

  private func load() {
    guard image == nil, requestId == nil else { return }
    let options = PHImageRequestOptions()
    options.deliveryMode = .opportunistic
    options.resizeMode = .fast
    options.isNetworkAccessAllowed = true
    let target = CGSize(width: side * displayScale, height: side * displayScale)
    requestId = PHImageManager.default().requestImage(
      for: asset,
      targetSize: target,
      contentMode: .aspectFill,
      options: options
    ) { result, _ in
      if let result {
        image = result
      }
    }
  }

  private func cancel() {
    if let requestId, image == nil {
      PHImageManager.default().cancelImageRequest(requestId)
    }
    requestId = nil
  }
}

@available(iOS 16.0, *)
private struct ActionRow: View {
  let theme: SheetTheme
  let icon: String
  let label: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      RowLabel(theme: theme, icon: icon, label: label)
    }
    .buttonStyle(.plain)
  }
}

@available(iOS 16.0, *)
private struct RowLabel: View {
  let theme: SheetTheme
  let icon: String
  let label: String
  var chevron = false

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: icon)
        .font(.system(size: 19))
        .foregroundColor(Color(theme.mutedForeground))
        .frame(width: 24)
      Text(label)
        .font(.system(size: 14, weight: .medium))
        .foregroundColor(Color(theme.foreground))
      Spacer()
      if chevron {
        Image(systemName: "chevron.right")
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(Color(theme.mutedForeground))
      }
    }
    .padding(.vertical, 10)
    .contentShape(Rectangle())
  }
}

@available(iOS 16.0, *)
private struct AddSelectedBar: View {
  @ObservedObject var model: SheetModel

  var body: some View {
    if !model.selection.isEmpty {
      VStack(spacing: 0) {
        Button(action: model.addSelected) {
          Group {
            if model.isExporting {
              ProgressView()
                .tint(Color(model.theme.primaryForeground))
            } else {
              Text(model.selection.count == 1 ? "Add" : "Add \(model.selection.count)")
                .font(.system(size: 16, weight: .semibold))
            }
          }
          .frame(maxWidth: .infinity)
          .frame(height: 48)
          .foregroundColor(Color(model.theme.primaryForeground))
          .background(Capsule().fill(Color(model.theme.primary)))
        }
        .buttonStyle(.plain)
        .disabled(model.isExporting)
      }
      .padding(.top, 8)
      .padding(.horizontal, 20)
      .padding(.bottom, 16)
      .frame(maxWidth: .infinity)
      .background(.ultraThinMaterial)
    }
  }
}

@available(iOS 16.0, *)
private struct PermissionCard: View {
  @ObservedObject var model: SheetModel
  let message: String

  var body: some View {
    VStack(spacing: 12) {
      Text(message)
        .font(.system(size: 14))
        .foregroundColor(Color(model.theme.secondaryForeground))
        .multilineTextAlignment(.center)
      Button {
        if model.canAskAgain {
          model.requestAccess()
        } else if let url = URL(string: UIApplication.openSettingsURLString) {
          UIApplication.shared.open(url)
        }
      } label: {
        Text(model.canAskAgain ? "Continue" : "Open Settings")
          .font(.system(size: 13, weight: .medium))
          .foregroundColor(Color(model.theme.foreground))
          .padding(.horizontal, 14)
          .padding(.vertical, 7)
          .overlay(Capsule().stroke(Color(model.theme.border)))
      }
      .buttonStyle(.plain)
    }
    .frame(maxWidth: .infinity)
    .padding(.horizontal, 16)
    .padding(.vertical, 20)
    .background(RoundedRectangle(cornerRadius: 12).fill(Color(model.theme.secondary)))
    .padding(.horizontal, 20)
  }
}
