import SwiftUI

struct FontSettingsPopover: View {
    @Binding var fontFamily: String
    @Binding var fontSize: Double
    var showTagToggle: Bool = false
    @Binding var showTags: Bool

    private static let fontOptions: [(label: String, value: String)] = [
        ("New York",          ".AppleSystemUISerifSemibold"),
        ("Georgia",           "Georgia"),
        ("Palatino",          "Palatino"),
        ("Times New Roman",   "Times New Roman"),
        ("Lora",              "Lora"),
        ("Merriweather",      "Merriweather-Regular"),
        ("EB Garamond",       "EBGaramond"),
        ("SF Pro",            ".AppleSystemUIFont"),
        ("Avenir Next",       "Avenir Next"),
    ]

    var body: some View {
        Form {
            Section("Font") {
                ForEach(Self.fontOptions, id: \.label) { option in
                    Button {
                        fontFamily = option.value
                    } label: {
                        HStack {
                            Text(option.label)
                                .foregroundStyle(.primary)
                            Spacer()
                            if fontFamily == option.value {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.tint)
                            }
                        }
                    }
                }
            }
            Section("Size") {
                HStack {
                    Text("\(Int(fontSize))pt")
                        .monospacedDigit()
                        .frame(width: 48, alignment: .leading)
                    Slider(value: $fontSize, in: 13...28, step: 1)
                }
            }
            if showTagToggle {
                Section("Display") {
                    Toggle("Show Tags", isOn: $showTags)
                }
            }
        }
    }
}

func resolveFont(name: String, size: Double, bold: Bool = false) -> Font {
    let base = Font.custom(name, size: CGFloat(size))
    return bold ? base.bold() : base
}
