import UIKit
import Capacitor

// The app uses the scene lifecycle, so iOS delivers URLs (app.lazychef://, used for the Google
// sign-in return) and universal links to SceneDelegate, which forwards them to SceneDelegateProxy.
// application(_:open:options:) and application(_:continue:restorationHandler:) are never called
// here, so there's nothing to forward to ApplicationDelegateProxy.
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
