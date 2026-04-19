import SwiftUI
import WebKit

struct TipTapEditorView: UIViewRepresentable {
    let initialContent: String
    var onContentChanged: ((String) -> Void)?

    func makeCoordinator() -> Coordinator {
        Coordinator(onContentChanged: onContentChanged)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let userCC = config.userContentController
        userCC.add(context.coordinator, name: "contentChanged")
        userCC.add(context.coordinator, name: "editorReady")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground

        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        context.coordinator.webView = webView

        // Xcode flattens the Resources/Editor/ directory into the .app root,
        // so the subdirectory hint returns nil. Look up by name only.
        if let htmlURL = Bundle.main.url(forResource: "editor", withExtension: "html") {
            webView.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())
        }

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Only push content when the coordinator hasn't received editorReady yet,
        // or when initialContent changes and doesn't match what the editor has.
        context.coordinator.pendingContent = initialContent
        context.coordinator.pushContentIfReady()
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, WKScriptMessageHandler {
        var webView: WKWebView?
        var onContentChanged: ((String) -> Void)?
        var pendingContent: String?
        var editorReady = false
        private var lastPushedContent: String?

        init(onContentChanged: ((String) -> Void)?) {
            self.onContentChanged = onContentChanged
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            switch message.name {
            case "editorReady":
                editorReady = true
                pushContentIfReady()
            case "contentChanged":
                if let html = message.body as? String {
                    lastPushedContent = html
                    onContentChanged?(html)
                }
            default:
                break
            }
        }

        func pushContentIfReady() {
            guard editorReady, let content = pendingContent, content != lastPushedContent else { return }
            lastPushedContent = content
            let escaped = content
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
                .replacingOccurrences(of: "\r", with: "")
            webView?.evaluateJavaScript("window.editorAPI?.setContent('\(escaped)')")
        }
    }
}
