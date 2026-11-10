import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

Kirigami.FormLayout {
    id: root

    // Plasma passes these in; declaring them silences "does not have a property" warnings
    property var wallpaperConfiguration
    property var configDialog

    property alias cfg_population: popSpin.value
    property alias cfg_pace: paceS.value
    property alias cfg_lifespan: lifeSpin.value
    property alias cfg_persistence: persistS.value
    property alias cfg_threadWidth: widthS.value
    property alias cfg_traceBrightness: traceS.value
    property alias cfg_timelapse: lapseBox.checked

    component LabelSlider: RowLayout {
        property alias value: s.value
        property alias from: s.from
        property alias to: s.to
        property alias stepSize: s.stepSize
        property string suffix: " %"
        QQC2.Slider { id: s; from: 0; to: 100; stepSize: 1; Layout.preferredWidth: Kirigami.Units.gridUnit * 14 }
        QQC2.Label { text: Math.round(s.value) + parent.suffix; Layout.minimumWidth: Kirigami.Units.gridUnit * 4 }
    }

    QQC2.SpinBox { id: popSpin; Kirigami.FormData.label: i18n("Most lives at once:"); from: 8; to: 48 }
    QQC2.SpinBox { id: lifeSpin; Kirigami.FormData.label: i18n("A long life lasts (minutes):"); from: 3; to: 40 }
    LabelSlider { id: paceS; Kirigami.FormData.label: i18n("Walking pace:"); from: 40; to: 300; stepSize: 10 }
    LabelSlider { id: persistS; Kirigami.FormData.label: i18n("Traces fade over:"); from: 5; to: 180; stepSize: 5; suffix: i18n(" min") }
    LabelSlider { id: widthS; Kirigami.FormData.label: i18n("Thread width:"); from: 50; to: 250; stepSize: 10 }
    LabelSlider { id: traceS; Kirigami.FormData.label: i18n("Trace brightness:"); from: 10; to: 100; stepSize: 5 }
    QQC2.CheckBox { id: lapseBox; text: i18n("Open with a time-lapse of the past") }
}
