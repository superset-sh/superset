import ActivityKit
import ExpoModulesCore
import UIKit

struct AgentRowRecord: Record {
  @Field var id: String = ""
  @Field var workspaceId: String = ""
  @Field var name: String = ""
  @Field var project: String = ""
  @Field var iconFile: String? = nil
  @Field var status: String = ""
  @Field var state: String = "working"
  /// Pre-formatted time in state — "12m", "1h". See AgentRow.elapsed.
  @Field var elapsed: String = ""
  @Field var isQuiet: Bool = false
}

struct AgentSnapshotRecord: Record {
  @Field var headline: String = ""
  @Field var rows: [AgentRowRecord] = []
  @Field var more: String? = nil
  @Field var totalCount: Int = 0
  @Field var topState: String = "working"
  @Field var staleDetail: String = ""
  @Field var machineName: String = ""
  /// Seconds until the card should call itself out of date. 0 = never.
  @Field var staleAfterSeconds: Double = 0
}

private func contentState(
  from snapshot: AgentSnapshotRecord
) -> AgentActivityAttributes.ContentState {
  AgentActivityAttributes.ContentState(
    headline: snapshot.headline,
    rows: snapshot.rows.map {
      AgentActivityAttributes.AgentRow(
        id: $0.id, workspaceId: $0.workspaceId, name: $0.name, project: $0.project, iconFile: $0.iconFile,
        status: $0.status, state: $0.state, elapsed: $0.elapsed, isQuiet: $0.isQuiet)
    },
    more: snapshot.more,
    totalCount: snapshot.totalCount,
    topState: snapshot.topState,
    staleDetail: snapshot.staleDetail
  )
}

private func iconsDirectory() throws -> URL {
  guard
    let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: AgentActivityAttributes.appGroup)
  else {
    throw Exception(name: "ERR_NO_APP_GROUP", description: "App Group unavailable")
  }
  let dir = container.appendingPathComponent("icons", isDirectory: true)
  try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  return dir
}

public final class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    Function("areActivitiesEnabled") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    Function("activeIds") { () -> [String] in
      Activity<AgentActivityAttributes>.activities.map(\.id)
    }

    /// Downloads a project icon, downscales it, and writes it into the App
    /// Group so the widget extension can read it off disk. The extension has
    /// no network of its own, and a 54pt PNG is 35-76% of the entire 4KB
    /// ContentState budget, so it cannot travel in the payload either.
    AsyncFunction("cacheIcon") { (key: String, url: String) -> String in
      // The key is a project id, but it arrives from JS: a separator or a
      // traversal component would write outside the icons directory.
      let safe = key.replacingOccurrences(
        of: "[^A-Za-z0-9._-]", with: "_", options: .regularExpression)
      guard !safe.isEmpty, safe != ".", safe != ".." else {
        throw Exception(name: "ERR_BAD_KEY", description: key)
      }
      let file = "\(safe).png"
      let target = try iconsDirectory().appendingPathComponent(file)
      if FileManager.default.fileExists(atPath: target.path) { return file }
      guard let source = URL(string: url) else {
        throw Exception(name: "ERR_BAD_URL", description: url)
      }
      let (data, _) = try await URLSession.shared.data(from: source)
      guard let image = UIImage(data: data) else {
        throw Exception(name: "ERR_DECODE", description: "not an image")
      }
      // Apple: an asset larger than the presentation "might fail to start the
      // Live Activity", so never cache at source resolution.
      let side: CGFloat = 54
      let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
      let scaled = renderer.image { _ in
        image.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
      }
      guard let png = scaled.pngData() else {
        throw Exception(name: "ERR_ENCODE", description: "png encode failed")
      }
      try png.write(to: target, options: .atomic)
      return file
    }

    AsyncFunction("start") { (snapshot: AgentSnapshotRecord) -> String in
      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        throw Exception(name: "ERR_DISABLED", description: "Live Activities are off")
      }
      let stale = snapshot.staleAfterSeconds > 0
        ? Date().addingTimeInterval(snapshot.staleAfterSeconds) : nil
      let activity = try Activity.request(
        attributes: AgentActivityAttributes(machineName: snapshot.machineName),
        content: .init(state: contentState(from: snapshot), staleDate: stale),
        pushType: nil
      )
      return activity.id
    }

    AsyncFunction("update") { (id: String, snapshot: AgentSnapshotRecord, alert: String?) in
      guard let activity = Activity<AgentActivityAttributes>.activities.first(where: { $0.id == id })
      else { return }
      let stale = snapshot.staleAfterSeconds > 0
        ? Date().addingTimeInterval(snapshot.staleAfterSeconds) : nil
      let content = ActivityContent(state: contentState(from: snapshot), staleDate: stale)
      if let alert {
        await activity.update(
          content,
          alertConfiguration: AlertConfiguration(
            title: "\(alert)", body: "\(snapshot.headline)", sound: .default))
      } else {
        await activity.update(content)
      }
    }

    AsyncFunction("endAll") {
      for activity in Activity<AgentActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
