import Flutter
import UIKit

private class ShareEventhandler: NSObject, FlutterStreamHandler {
  func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
    ShareBridge.sink = events
    return nil
  }
  func onCancel(withArguments arguments: Any?) -> FlutterError? {
    ShareBridge.sink = nil
    return nil
  }
}

private class ShareBridge {
  static let name = "com.tfjl.app/share"
  static var pending: [String: Any]?
  static var sink: FlutterEventSink?
  static let handler = ShareEventhandler()

  static func emit(_ payload: [String: Any]) {
    pending = payload
    sink?(payload)
  }
}

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    let ok = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    if let controller = window?.rootViewController as? FlutterViewController {
      setupChannels(controller.binaryMessenger)
    }
    return ok
  }

  private func setupChannels(_ messenger: FlutterBinaryMessenger) {
    FlutterMethodChannel(name: ShareBridge.name, binaryMessenger: messenger)
      .setMethodCallHandler { call, result in
        if call.method == "getPending" {
          result(ShareBridge.pending)
          ShareBridge.pending = nil
        } else if call.method == "readUri" {
          guard let uri = call.arguments as? [String: Any], let s = uri["uri"] as? String,
                let url = URL(string: s) else { result(""); return }
          if let text = try? String(contentsOf: url, encoding: .utf8) { result(text) } else { result("") }
        } else {
          result(FlutterMethodNotImplemented)
        }
      }

    FlutterEventChannel(name: "\(ShareBridge.name)/events", binaryMessenger: messenger)
      .setStreamHandler(ShareBridge.handler)
  }

  // tfjl:// 与「用其他应用打开」的 txt/json
  override func application(_ app: UIApplication, open url: URL,
                            options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    var payload: [String: Any] = ["type": "uri", "uri": url.absoluteString]
    if let text = try? String(contentsOf: url, encoding: .utf8) {
      payload["content"] = text
    }
    ShareBridge.emit(payload)
    return true
  }
}
