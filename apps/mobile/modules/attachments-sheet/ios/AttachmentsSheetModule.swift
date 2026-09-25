import ExpoModulesCore
import Photos
import SwiftUI
import UIKit

internal struct SheetOptions: Record {
  @Field var colorScheme: String = "dark"
  @Field var background: Int = 0
  @Field var foreground: Int = 0
  @Field var mutedForeground: Int = 0
  @Field var border: Int = 0
  @Field var secondary: Int = 0
  @Field var secondaryForeground: Int = 0
  @Field var primary: Int = 0
  @Field var primaryForeground: Int = 0
}

internal struct SheetTheme {
  let interfaceStyle: UIUserInterfaceStyle
  let background: UIColor
  let foreground: UIColor
  let mutedForeground: UIColor
  let border: UIColor
  let secondary: UIColor
  let secondaryForeground: UIColor
  let primary: UIColor
  let primaryForeground: UIColor

  init(options: SheetOptions) {
    interfaceStyle = options.colorScheme == "light" ? .light : .dark
    background = UIColor(argb: options.background)
    foreground = UIColor(argb: options.foreground)
    mutedForeground = UIColor(argb: options.mutedForeground)
    border = UIColor(argb: options.border)
    secondary = UIColor(argb: options.secondary)
    secondaryForeground = UIColor(argb: options.secondaryForeground)
    primary = UIColor(argb: options.primary)
    primaryForeground = UIColor(argb: options.primaryForeground)
  }
}

private extension UIColor {
  convenience init(argb: Int) {
    let value = UInt32(truncatingIfNeeded: argb)
    self.init(
      red: CGFloat((value >> 16) & 0xFF) / 255,
      green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255,
      alpha: CGFloat((value >> 24) & 0xFF) / 255
    )
  }
}

public final class AttachmentsSheetModule: Module {
  private var activeController: AttachmentsSheetController?

  public func definition() -> ModuleDefinition {
    Name("AttachmentsSheet")

    Events("onAddAssets", "onAction", "onDismiss")

    AsyncFunction("present") { (options: SheetOptions, promise: Promise) in
      guard #available(iOS 16.0, *),
        let presenter = self.appContext?.utilities?.currentViewController()
      else {
        promise.resolve(false)
        return
      }
      let controller = AttachmentsSheetController(theme: SheetTheme(options: options))
      controller.onEvent = { [weak self] name, payload in
        self?.activeController = nil
        self?.sendEvent(name, payload)
      }
      controller.present(from: presenter)
      self.activeController = controller
      promise.resolve(true)
    }.runOnQueue(.main)
  }
}

/// Presents the SwiftUI sheet and funnels every terminal path (add, row
/// action, swipe-dismiss) into exactly one event back to JS.
internal final class AttachmentsSheetController: NSObject,
  UISheetPresentationControllerDelegate
{
  var onEvent: ((String, [String: Any]) -> Void)?
  private let theme: SheetTheme
  private weak var host: UIViewController?

  init(theme: SheetTheme) {
    self.theme = theme
  }

  @available(iOS 16.0, *)
  func present(from presenter: UIViewController) {
    let model = SheetModel(theme: theme)
    model.onAction = { [weak self] action in
      self?.finish("onAction", ["action": action])
    }
    model.onAdd = { [weak self] assets in
      self?.finish("onAddAssets", ["assets": assets])
    }
    model.onClose = { [weak self] in
      self?.finish("onDismiss", [:])
    }

    let host = UIHostingController(rootView: AttachmentsSheetRootView(model: model))
    host.view.backgroundColor = theme.background
    host.overrideUserInterfaceStyle = theme.interfaceStyle
    host.modalPresentationStyle = .pageSheet
    if let sheet = host.sheetPresentationController {
      sheet.detents = [.medium(), .large()]
      sheet.prefersGrabberVisible = true
      sheet.delegate = self
    }
    self.host = host
    // The composer's SwiftUI TextField keeps the keyboard through a sheet
    // presentation; the old route push blurred it as a side effect.
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil
    )
    presenter.present(host, animated: true)
  }

  private func finish(_ event: String, _ payload: [String: Any]) {
    guard let host, host.presentingViewController != nil else {
      onEvent?(event, payload)
      return
    }
    host.presentingViewController?.dismiss(animated: true) { [weak self] in
      self?.onEvent?(event, payload)
    }
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    onEvent?("onDismiss", [:])
  }
}
