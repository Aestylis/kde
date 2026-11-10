import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kquickcontrols as KQC

Kirigami.FormLayout {
    id: root

    // Plasma passes these in; declaring them silences "does not have a property" warnings
    property var wallpaperConfiguration
    property var configDialog

    property int cfg_preset
    property alias cfg_color1: col1.color
    property alias cfg_color2: col2.color
    property alias cfg_color3: col3.color
    property alias cfg_color4: col4.color
    property alias cfg_fourColors: fourBox.checked
    property alias cfg_colorMix: mixS.value
    property alias cfg_dots: dotsS.value
    property alias cfg_dotSize: dotSizeS.value
    property alias cfg_linkDist: linkS.value
    property alias cfg_lineWidth: lineWS.value
    property alias cfg_lineBright: lineBS.value
    property alias cfg_triAmount: triAS.value
    property alias cfg_triOpacity: triOS.value
    property alias cfg_speed: speedS.value
    property alias cfg_layoutMode: layoutBox.currentIndex
    property alias cfg_coverage: covS.value
    property alias cfg_layers: layersSpin.value
    property alias cfg_blur: blurS.value
    property alias cfg_glow: glowS.value
    property alias cfg_brightness: brightS.value
    property alias cfg_fps: fpsSpin.value
    property alias cfg_span: spanBox.checked
    property alias cfg_renderScale: scaleBox.currentIndex
    property alias cfg_arrangement: arrBox.currentIndex

    // Default combinations. The last combo entry ("Custom") is whatever the colour buttons hold.
    readonly property var presets: [
        { name: i18n("Ultraviolet"),             c: ["#3b3bff", "#8a3cff", "#e040fb", "#ff2d87"] },
        { name: i18n("Blue and orange"),         c: ["#0047ff", "#00a3ff", "#ffb300", "#ff6a00"] },
        { name: i18n("Teal and coral"),          c: ["#00d1c1", "#00a0ff", "#ff5e7a", "#ffb199"] },
        { name: i18n("Violet and lime"),         c: ["#6a2cff", "#b44bff", "#c6ff3d", "#3dff9e"] },
        { name: i18n("Magenta and green"),       c: ["#ff2bd6", "#ff6ab0", "#2bffb0", "#00c46a"] },
        { name: i18n("Aurora"),                  c: ["#00e5a0", "#00b8ff", "#7a5cff", "#e85cff"] },
        { name: i18n("Prism"),                   c: ["#ff3b3b", "#ffd23b", "#2bff88", "#3b8bff"] },
        { name: i18n("Ember"),                   c: ["#ff2a00", "#ff7a00", "#ffc400", "#ff3d6e"] },
        { name: i18n("Ice"),                     c: ["#2a4bff", "#3fa0ff", "#9fd8ff", "#ffffff"] },
        { name: i18n("Triad"),                   c: ["#a04bff", "#ff8a1f", "#19e68c", "#a04bff"] }
    ]
    function applyPreset(i) {
        if (i < 0 || i >= presets.length) return
        var c = presets[i].c
        col1.color = c[0]; col2.color = c[1]; col3.color = c[2]; col4.color = c[3]
    }

    component PercentSlider: RowLayout {
        property alias value: s.value
        property alias from: s.from
        property alias to: s.to
        property alias stepSize: s.stepSize
        property string suffix: " %"
        QQC2.Slider { id: s; from: 0; to: 100; stepSize: 1; Layout.preferredWidth: Kirigami.Units.gridUnit * 14 }
        QQC2.Label { text: Math.round(s.value) + parent.suffix; Layout.minimumWidth: Kirigami.Units.gridUnit * 3 }
    }

    QQC2.ComboBox {
        id: presetBox
        Kirigami.FormData.label: i18n("Colours:")
        model: root.presets.map(p => p.name).concat([i18n("Custom")])
        currentIndex: Math.max(0, Math.min(root.cfg_preset, root.presets.length))
        onActivated: index => { root.cfg_preset = index; root.applyPreset(index) }
    }
    RowLayout {
        KQC.ColorButton { id: col1; showAlphaChannel: false; onAccepted: root.cfg_preset = root.presets.length }
        KQC.ColorButton { id: col2; showAlphaChannel: false; onAccepted: root.cfg_preset = root.presets.length }
        KQC.ColorButton { id: col3; showAlphaChannel: false; onAccepted: root.cfg_preset = root.presets.length }
        KQC.ColorButton { id: col4; showAlphaChannel: false; enabled: fourBox.checked; onAccepted: root.cfg_preset = root.presets.length }
    }
    QQC2.CheckBox { id: fourBox; text: i18n("Use the fourth colour") }
    PercentSlider {
        id: mixS
        Kirigami.FormData.label: i18n("Colour scatter:")
        QQC2.ToolTip.text: i18n("0 %: colours flow smoothly across the screen. 100 %: every dot picks its own.")
        QQC2.ToolTip.visible: hov.hovered
        HoverHandler { id: hov }
    }

    Item { Kirigami.FormData.isSection: true; Kirigami.FormData.label: i18n("Dots and lines") }
    PercentSlider { id: dotsS; Kirigami.FormData.label: i18n("Number of dots:"); from: 20; to: 500; stepSize: 10; suffix: "" }
    PercentSlider { id: dotSizeS; Kirigami.FormData.label: i18n("Dot size:"); from: 0; to: 300; stepSize: 5 }
    PercentSlider { id: linkS; Kirigami.FormData.label: i18n("Link distance:"); from: 30; to: 100 }
    PercentSlider { id: lineWS; Kirigami.FormData.label: i18n("Line width:"); from: 50; to: 400; stepSize: 5 }
    PercentSlider { id: lineBS; Kirigami.FormData.label: i18n("Line brightness:"); from: 0; to: 200; stepSize: 5 }

    Item { Kirigami.FormData.isSection: true; Kirigami.FormData.label: i18n("Triangles") }
    PercentSlider { id: triAS; Kirigami.FormData.label: i18n("Amount:") }
    PercentSlider { id: triOS; Kirigami.FormData.label: i18n("Opacity:") }

    Item { Kirigami.FormData.isSection: true; Kirigami.FormData.label: i18n("Motion and layout") }
    PercentSlider { id: speedS; Kirigami.FormData.label: i18n("Speed:"); from: 0; to: 400; stepSize: 5 }
    QQC2.ComboBox {
        id: layoutBox
        Kirigami.FormData.label: i18n("Layout:")
        model: [i18n("Drifting clusters"), i18n("Wave across the screen"), i18n("Whole screen")]
    }
    QQC2.CheckBox {
        id: spanBox
        text: i18n("Continue across monitors")
        QQC2.ToolTip.text: i18n("All monitors show parts of one desktop-wide pattern. Give every monitor the same settings.")
        QQC2.ToolTip.visible: hovered
    }
    QQC2.ComboBox {
        id: arrBox
        Kirigami.FormData.label: i18n("Monitor arrangement:")
        enabled: spanBox.checked
        model: [i18n("As in Display settings"), i18n("Stacked top to bottom")]
    }
    PercentSlider { id: covS; Kirigami.FormData.label: i18n("Coverage:"); from: 5; to: 100; enabled: layoutBox.currentIndex !== 2 }

    Item { Kirigami.FormData.isSection: true; Kirigami.FormData.label: i18n("Depth and light") }
    QQC2.SpinBox { id: layersSpin; Kirigami.FormData.label: i18n("Depth layers:"); from: 1; to: 4 }
    PercentSlider { id: blurS; Kirigami.FormData.label: i18n("Blur:"); enabled: layersSpin.value > 1 }
    PercentSlider { id: glowS; Kirigami.FormData.label: i18n("Glow:") }
    PercentSlider { id: brightS; Kirigami.FormData.label: i18n("Brightness:"); from: 20; to: 200; stepSize: 5 }
    QQC2.ComboBox {
        id: scaleBox
        Kirigami.FormData.label: i18n("Rendering:")
        model: [i18n("Balanced (lighter on scaled screens)"), i18n("Sharp (every pixel)")]
    }
    QQC2.SpinBox { id: fpsSpin; Kirigami.FormData.label: i18n("Frame rate:"); from: 12; to: 24 }
}
