import AVFoundation
import ExpoModulesCore

/// Owns `AVAudioSession` for the length of a voice call. WebRTC configures a
/// session of its own when the first track starts, but it picks the receiver
/// for `.voiceChat`; this puts the call on the speaker and on whatever
/// Bluetooth is connected, and tells JS when iOS takes the audio away.
public final class VoiceAudioModule: Module {
  private var observing = false

  public func definition() -> ModuleDefinition {
    Name("VoiceAudio")

    Events("onInterruption", "onRouteChange")

    AsyncFunction("configure") { () throws in
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(
        .playAndRecord,
        mode: .voiceChat,
        options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP]
      )
      try session.setActive(true, options: [])
      try session.overrideOutputAudioPort(.speaker)
      self.startObserving()
    }

    /// WebRTC resets the route when its audio unit starts; call again after the
    /// call is up to land back on the speaker.
    AsyncFunction("preferSpeaker") { (on: Bool) throws in
      try AVAudioSession.sharedInstance().overrideOutputAudioPort(on ? .speaker : .none)
    }

    AsyncFunction("release") { () in
      self.stopObserving()
      // Other apps' audio comes back when ours lets go; a failure here is
      // nothing JS can act on.
      try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    Function("currentRoute") { () -> [String] in
      AVAudioSession.sharedInstance().currentRoute.outputs.map { $0.portType.rawValue }
    }

    OnDestroy {
      self.stopObserving()
    }
  }

  private func startObserving() {
    guard !observing else { return }
    observing = true
    let center = NotificationCenter.default
    center.addObserver(
      self, selector: #selector(handleInterruption(_:)),
      name: AVAudioSession.interruptionNotification, object: nil)
    center.addObserver(
      self, selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification, object: nil)
  }

  private func stopObserving() {
    guard observing else { return }
    observing = false
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func handleInterruption(_ notification: Notification) {
    guard
      let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: raw)
    else { return }
    var shouldResume = false
    if type == .ended,
      let optionsRaw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt
    {
      shouldResume = AVAudioSession.InterruptionOptions(rawValue: optionsRaw).contains(.shouldResume)
    }
    sendEvent(
      "onInterruption",
      [
        "phase": type == .began ? "began" : "ended",
        "shouldResume": shouldResume,
      ])
  }

  @objc private func handleRouteChange(_ notification: Notification) {
    guard
      let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
      let reason = AVAudioSession.RouteChangeReason(rawValue: raw)
    else { return }
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs.map { $0.portType.rawValue }
    sendEvent(
      "onRouteChange",
      [
        "reason": String(describing: reason),
        "outputs": outputs,
      ])
  }
}
