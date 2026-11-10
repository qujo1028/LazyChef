import UIKit
import Capacitor

/// Builds the app's only window in code. Info.plist deliberately has no `UISceneStoryboardFile` /
/// `UIMainStoryboardFile`, so UIKit doesn't also instantiate Main.storyboard's bridge view controller.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = .appBackground
        window.rootViewController = BridgeViewController()
        self.window = window
        window.makeKeyAndVisible()

        // Also replays connectionOptions.urlContexts / userActivities (e.g. an app.lazychef:// link
        // that cold-launched the app) once the bridge's plugins are registered.
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Registers the app-local plugins and paints the web view in the site's background colour for the
/// current appearance, so dark mode doesn't flash capacitor.config's cream `backgroundColor` before
/// the page renders.
class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // App-local plugins aren't in capacitor.config.json's packageClassList, so register them here.
        bridge?.registerPluginInstance(LazyChefAuthPlugin())

        view.backgroundColor = .appBackground
        if let webView {
            // An opaque WKWebView paints its own default background until the first frame.
            webView.isOpaque = false
            webView.backgroundColor = .appBackground
            webView.scrollView.backgroundColor = .appBackground
        }
    }
}

extension UIColor {
    /// Matches `--background` in native/www/offline.html and LaunchBackground.colorset.
    static let appBackground = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x1a / 255, green: 0x17 / 255, blue: 0x14 / 255, alpha: 1)
            : UIColor(red: 0xfb / 255, green: 0xf8 / 255, blue: 0xf1 / 255, alpha: 1)
    }
}
