import Cocoa
import WebKit
import SafariServices

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {
    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "appBridge")
        
        self.webView = WKWebView(frame: self.view.bounds, configuration: config)
        self.webView.navigationDelegate = self
        self.webView.setValue(false, forKey: "drawsBackground")
        self.view.addSubview(self.webView)
        
        self.webView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            self.webView.topAnchor.constraint(equalTo: self.view.topAnchor),
            self.webView.bottomAnchor.constraint(equalTo: self.view.bottomAnchor),
            self.webView.leadingAnchor.constraint(equalTo: self.view.leadingAnchor),
            self.webView.trailingAnchor.constraint(equalTo: self.view.trailingAnchor)
        ])
        
        self.preferredContentSize = NSSize(width: 460, height: 750)
        
        // 1. Last setup-siden for hovedappen
        if let url = Bundle.main.url(forResource: "Main", withExtension: "html") {
            self.webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "appBridge", let action = message.body as? String else { return }
        
        DispatchQueue.main.async {
            if action == "openPreferences" {
                SFSafariApplication.showPreferencesForExtension(withIdentifier: "GaiMS.OnePlayer.Extension") { error in
                    if let error = error {
                        print("Kunne ikke åpne Safari: \(error.localizedDescription)")
                    }
                }
            } else if action == "closeApp" {
                NSApplication.shared.terminate(nil)
            }
        }
    }
}
