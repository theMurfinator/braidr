import SwiftUI

struct FontOption: Identifiable {
    let id: String
    let label: String
    let swiftUIName: String

    static let all: [FontOption] = [
        FontOption(id: "newyork",       label: "New York",          swiftUIName: ".AppleSystemUISerifSemibold"),
        FontOption(id: "georgia",       label: "Georgia",           swiftUIName: "Georgia"),
        FontOption(id: "palatino",      label: "Palatino",          swiftUIName: "Palatino"),
        FontOption(id: "timesnewroman", label: "Times New Roman",   swiftUIName: "Times New Roman"),
        FontOption(id: "lora",          label: "Lora",              swiftUIName: "Lora"),
        FontOption(id: "merriweather",  label: "Merriweather",      swiftUIName: "Merriweather-Regular"),
        FontOption(id: "ebgaramond",    label: "EB Garamond",       swiftUIName: "EBGaramond"),
        FontOption(id: "sfpro",         label: "SF Pro",            swiftUIName: ".AppleSystemUIFont"),
        FontOption(id: "avenirnext",    label: "Avenir Next",       swiftUIName: "Avenir Next"),
    ]
}

struct FontSettingsPopover: View {
    @Binding var fontFamily: String
    @Binding var fontSize: Double
    var showTagToggle: Bool = false
    @Binding var showTags: Bool

    var body: some View {
        Form {
            Section("Font") {
                ForEach(FontOption.all) { option in
                    Button {
                        fontFamily = option.swiftUIName
                    } label: {
                        HStack {
                            Text(option.label)
                                .font(.custom(option.swiftUIName, size: 16))
                                .foregroundStyle(.primary)
                            Spacer()
                            if fontFamily == option.swiftUIName {
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
