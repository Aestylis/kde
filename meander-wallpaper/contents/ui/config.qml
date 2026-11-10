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
    property alias cfg_channelWidth: widthS.value
    property alias cfg_speed: speedSpin.value
    property alias cfg_persistence: persistS.value
    property alias cfg_trailBrightness: trailS.value
    property alias cfg_riverBrightness: riverS.value

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
        model: [i18n("Survey map"), i18n("Neon"), i18n("Ember"), i18n("Glacier"), i18n("Ultraviolet")]
    }
    LabelSlider { id: widthS; Kirigami.FormData.label: i18n("River size:"); from: 50; to: 200; stepSize: 5 }
    QQC2.SpinBox { id: speedSpin; Kirigami.FormData.label: i18n("Speed:"); from: 1; to: 8 }
    LabelSlider { id: persistS; Kirigami.FormData.label: i18n("Old courses fade over:"); from: 5; to: 180; stepSize: 5; suffix: i18n(" min") }
    LabelSlider { id: trailS; Kirigami.FormData.label: i18n("Old course brightness:"); from: 10; to: 100; stepSize: 5 }
    LabelSlider { id: riverS; Kirigami.FormData.label: i18n("River brightness:"); from: 20; to: 100; stepSize: 5 }
}
