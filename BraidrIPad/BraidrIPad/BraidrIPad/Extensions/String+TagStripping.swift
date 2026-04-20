import Foundation

extension String {
    /// Remove inline `#tag` substrings (keeps the rest of the text).
    func strippingInlineTags() -> String {
        self
            .replacingOccurrences(of: "#[A-Za-z0-9_]+", with: "", options: .regularExpression)
            .replacingOccurrences(of: " +", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }
}
