import AuthenticationServices
import Capacitor
import UIKit

/// App-local Capacitor plugin for native sign-in (JS wrapper: src/lib/native-auth.ts).
///
/// Capacitor only auto-registers npm plugins listed in capacitor.config.json, so this one is
/// registered by hand in `BridgeViewController.capacitorDidLoad()` (SceneDelegate.swift). The app
/// loads the live site, so the web code must check `Capacitor.isPluginAvailable("LazyChefAuth")`
/// before calling it: older app builds don't have it.
@objc(LazyChefAuthPlugin)
public class LazyChefAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LazyChefAuthPlugin"
    public let jsName = "LazyChefAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openAuthSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise)
    ]

    /// Strong references: neither ASWebAuthenticationSession nor ASAuthorizationController keeps
    /// itself alive while its UI is up.
    private var authSession: ASWebAuthenticationSession?
    /// Which session `authSession` is, so a cancelled earlier session's late completion can't clear it.
    private var authSessionID: UUID?
    private var appleController: ASAuthorizationController?
    private var appleCall: CAPPluginCall?

    private var presentationAnchor: ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    // MARK: - OAuth in an ASWebAuthenticationSession

    @objc func openAuthSession(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            return call.reject("Must provide a valid url")
        }
        guard let callbackScheme = call.getString("callbackScheme"), !callbackScheme.isEmpty else {
            return call.reject("Must provide callbackScheme")
        }

        // Plugin methods run on a background queue; the session's UI must start on the main thread.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.authSession?.cancel()

            let sessionID = UUID()
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { [weak self] callbackURL, error in
                DispatchQueue.main.async {
                    guard let self, self.authSessionID == sessionID else { return }
                    self.authSession = nil
                    self.authSessionID = nil
                }
                if let callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("The user canceled sign-in", "CANCELED", error)
                } else {
                    call.reject(error?.localizedDescription ?? "Sign-in failed", nil, error)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.authSession = session
            self.authSessionID = sessionID

            if !session.start() {
                self.authSession = nil
                self.authSessionID = nil
                call.reject("Could not start the sign-in session")
            }
        }
    }

    // MARK: - Sign in with Apple

    /// Requires the "Sign in with Apple" capability (com.apple.developer.applesignin entitlement).
    /// It is deliberately NOT enabled yet: the owner isn't in the Apple Developer Program and a free
    /// Personal Team can't sign with that entitlement. Until it is, this rejects with an
    /// ASAuthorizationError. See docs/mobile-apps.md, "Xcode steps for Sign in with Apple".
    ///
    /// `nonce` must already be SHA-256 hashed (hex); Supabase is given the raw nonce.
    @objc func signInWithApple(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            return call.reject("Must provide nonce")
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if let pending = self.appleCall {
                pending.reject("Superseded by a new sign-in request", "CANCELED")
            }

            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = nonce

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.appleController = controller
            self.appleCall = call
            controller.performRequests()
        }
    }

    /// The pending call, if `controller` is the current request. A superseded controller (its call was
    /// already rejected as CANCELED) gets nil, so its late callback can't settle the newer call.
    private func finishApple(_ controller: ASAuthorizationController) -> CAPPluginCall? {
        guard controller === appleController else { return nil }
        let call = appleCall
        appleCall = nil
        appleController = nil
        return call
    }
}

/// JS sees `null` rather than a missing key.
private func orNull(_ value: String?) -> Any {
    value.map { $0 as Any } ?? NSNull()
}

extension LazyChefAuthPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        presentationAnchor
    }
}

extension LazyChefAuthPlugin: ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        presentationAnchor
    }
}

extension LazyChefAuthPlugin: ASAuthorizationControllerDelegate {
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = finishApple(controller) else { return }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            return call.reject("Unexpected credential type")
        }
        guard let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            return call.reject("Apple didn't return an identity token")
        }
        let authorizationCode = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }

        // Name and email are only provided on the first sign-in for this Apple ID + app.
        call.resolve([
            "identityToken": identityToken,
            "authorizationCode": orNull(authorizationCode),
            "givenName": orNull(credential.fullName?.givenName),
            "familyName": orNull(credential.fullName?.familyName),
            "email": orNull(credential.email)
        ])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = finishApple(controller) else { return }
        if let error = error as? ASAuthorizationError, error.code == .canceled {
            call.reject("The user canceled sign-in", "CANCELED", error)
        } else {
            call.reject(error.localizedDescription, nil, error)
        }
    }
}
