import SwiftUI

struct CreateBranchSheet: View {
    @Bindable var viewModel: ProjectViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var descriptionText = ""

    private var sanitizedName: String {
        name.lowercased()
            .replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
            .replacingOccurrences(of: "[^a-z0-9\\-]", with: "", options: .regularExpression)
            .replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Branch name", text: $name)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    if !name.isEmpty && sanitizedName != name.lowercased() {
                        Text("Will be saved as: \(sanitizedName)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Section {
                    TextField("Description (optional)", text: $descriptionText)
                }
            }
            .navigationTitle("New Branch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            await viewModel.createBranch(
                                name: sanitizedName,
                                description: descriptionText.isEmpty ? nil : descriptionText
                            )
                            dismiss()
                        }
                    }
                    .disabled(sanitizedName.isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
