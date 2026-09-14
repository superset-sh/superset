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
  /// Epoch milliseconds. See AgentRow.since.
  @Field var since: Double = 0
  @Field var isQuiet: Bool = false
}

struct AgentSnapshotRecord: Record {
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
    rows: snapshot.rows.map {
      AgentActivityAttributes.AgentRow(
        id: $0.id, workspaceId: $0.workspaceId, name: $0.name, project: $0.project, iconFile: $0.iconFile,
        status: $0.status, state: $0.state, since: $0.since, isQuiet: $0.isQuiet)
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

private extension Data {
  var hex: String { map { String(format: "%02x", $0) }.joined() }
}

public final class LiveActivityModule: Module {
  private var observers: [Task<Void, Never>] = []
  private var pushToStartToken: String?
  private var activityTokens: [String: String] = [:]

  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    // ActivityKit hands out push tokens over async sequences that only yield
    // on change, so the module remembers the latest and JS asks for them on
    // mount; the events cover everything after that.
    Events("onPushToken", "onPushToStartToken", "onActivityEnded")

    OnStartObserving { self.startObserving() }
    OnStopObserving { self.stopObserving() }

    Function("pushToStartToken") { () -> String? in self.pushToStartToken }
    Function("activityTokens") { () -> [String: String] in self.activityTokens }

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
        pushType: .token
      )
      self.watch(activity)
      return activity.id
    }

    AsyncFunction("update") { (id: String, snapshot: AgentSnapshotRecord) in
      guard let activity = Activity<AgentActivityAttributes>.activities.first(where: { $0.id == id })
      else { return }
      let stale = snapshot.staleAfterSeconds > 0
        ? Date().addingTimeInterval(snapshot.staleAfterSeconds) : nil
      await activity.update(ActivityContent(state: contentState(from: snapshot), staleDate: stale))
    }

    AsyncFunction("endAll") {
      for activity in Activity<AgentActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  private func startObserving() {
    stopObserving()
    observers.append(Task { @MainActor in
      for await data in Activity<AgentActivityAttributes>.pushToStartTokenUpdates {
        let token = data.hex
        self.pushToStartToken = token
        self.sendEvent("onPushToStartToken", ["token": token])
      }
    })
    for activity in Activity<AgentActivityAttributes>.activities {
      watch(activity)
    }
    // Activities started by a push-to-start arrive here, never through
    // `start`, and their update tokens still have to reach the API.
    observers.append(Task { @MainActor in
      for await activity in Activity<AgentActivityAttributes>.activityUpdates {
        self.watch(activity)
      }
    })
  }

  private func stopObserving() {
    for task in observers { task.cancel() }
    observers.removeAll()
  }

  private func watch(_ activity: Activity<AgentActivityAttributes>) {
    observers.append(Task { @MainActor in
      for await data in activity.pushTokenUpdates {
        let token = data.hex
        self.activityTokens[activity.id] = token
        self.sendEvent("onPushToken", ["activityId": activity.id, "token": token])
      }
    })
    observers.append(Task { @MainActor in
      for await state in activity.activityStateUpdates {
        guard state == .ended || state == .dismissed else { continue }
        let token = self.activityTokens.removeValue(forKey: activity.id)
        self.sendEvent("onActivityEnded", ["activityId": activity.id, "token": token as Any])
        break
      }
    })
  }
}
