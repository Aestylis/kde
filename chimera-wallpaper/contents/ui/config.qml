import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

Kirigami.FormLayout {
    id: root

    // Plasma passes these in; declaring them silences "does not have a property" warnings
    property var wallpaperConfiguration
    property var configDialog

    property alias cfg_palette: paletteBox.currentIndex
    property alias cfg_spacing: spacingS.value
    property alias cfg_dotSize: dotS.value
    property alias cfg_period: periodSpin.value
    property alias cfg_disorder: disorderS.value
    property alias cfg_wander: wanderBox.checked
    property alias cfg_reach: reachSpin.value
    property alias cfg_brightness: brightS.value
    property alias cfg_fps: fpsSpin.value

    component LabelSlider: RowLayout {
        property alias value: s.value
        property alias from: s.from
        property alias to: s.to
        property alias stepSize: s.stepSize
        property string suffix: " %"
        QQC2.Slider { id: s; from: 0; to: 100; stepSize: 1; Layout.preferredWidth: Kirigami.Units.gridUnit * 14 }
        QQC2.Label { text: Math.round(s.value) + parent.suffix; Layout.minimumWidth: Kirigami.Units.gridUnit * 4 }
    }

    QQC2.ComboBox {
        id: paletteBox
        Kirigami.FormData.label: i18n("Colours:")
        model: [i18n("Firefly"), i18n("Deep sea"), i18n("Ultraviolet"), i18n("Ember"), i18n("Moonlight")]
    }
    LabelSlider { id: spacingS; Kirigami.FormData.label: i18n("Dot spacing:"); from: 12; to: 48; suffix: " px" }
    LabelSlider { id: dotS; Kirigami.FormData.label: i18n("Dot size:"); from: 40; to: 180; stepSize: 5 }
    QQC2.SpinBox { id: periodSpin; Kirigami.FormData.label: i18n("Seconds per flash:"); from: 2; to: 12 }
    LabelSlider {
        id: disorderS
        Kirigami.FormData.label: i18n("Disorder:")
        QQC2.ToolTip.text: i18n("Low: broad waves and a few spirals. High: islands of chaos in a sea of unison.")
        QQC2.ToolTip.visible: dHover.hovered
        HoverHandler { id: dHover }
    }
    QQC2.CheckBox { id: wanderBox; text: i18n("Let the disorder drift over time") }
    QQC2.SpinBox { id: reachSpin; Kirigami.FormData.label: i18n("Neighbourhood reach (dots):"); from: 2; to: 12 }
    LabelSlider { id: brightS; Kirigami.FormData.label: i18n("Brightness:"); from: 20; to: 150; stepSize: 5 }
    QQC2.SpinBox { id: fpsSpin; Kirigami.FormData.label: i18n("Frame rate:"); from: 12; to: 24 }
}
