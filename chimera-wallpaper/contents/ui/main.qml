/* Chimera — Plasma 6 animated wallpaper for OLED screens.
 * A field of dots that flash like fireflies. Every dot keeps its own rhythm but is nudged by the average rhythm of
 * its neighbourhood. Parts of the field fall into unison and send waves and spirals across the screen, while other
 * parts never settle: a chimera state.
 *
 * The whole simulation lives on the GPU in textures one texel per dot:
 *   state  (cos, sin) of every dot's phase; feeds back into itself through step.frag, once per frame
 *   field  the state blurred across and then down (blur.frag): each dot's neighbourhood average
 * and show.frag draws the dots at screen resolution from those two.
 */
import QtQuick
import QtQuick.Window
import org.kde.plasma.plasmoid

WallpaperItem {
    id: main

    function cfg(name, def) {
        var v = main.configuration[name]
        return v === undefined ? def : v
    }
    // [colour where neighbours agree, colour where they do not]
    readonly property var palettes: [
        ["#d4ff4f", "#ff8a1f"],   // firefly
        ["#39e0ff", "#b04bff"],   // deep sea
        ["#5b6cff", "#ff2d87"],   // ultraviolet
        ["#ffb000", "#ff2a00"],   // ember
        ["#eaf2ff", "#6f86b8"]    // moonlight
    ]
    readonly property var colours: palettes[Math.max(0, Math.min(palettes.length - 1, cfg("palette", 0)))]
    readonly property int fps: Math.max(12, Math.min(24, cfg("fps", 20)))
    readonly property int cols: Math.max(8, Math.round(width / cfg("spacing", 22)))
    readonly property int rows: Math.max(8, Math.round(height / cfg("spacing", 22)))
    readonly property size grid: Qt.size(cols, rows)

    // Phase lag: 0.75 rad gives broad waves and a few spirals, 1.35 rad islands of chaos. With "wander" on it drifts
    // around the chosen value over about seven minutes (by the wall clock), so the field keeps changing character.
    property real now: 0
    readonly property real alpha: 0.75 + 0.6 * cfg("disorder", 30) / 100
                                  + (cfg("wander", true) ? 0.12 * Math.sin(now / 420 * 2 * Math.PI) : 0)
    // A dot in a synchronised region flashes once per `period` seconds.
    readonly property real pull: 2 * Math.PI / cfg("period", 7) * 0.8 / fps
    readonly property real omega: 2 * Math.PI / cfg("period", 7) / fps + pull * Math.sin(alpha)

    property int resetFrames: 3
    onColsChanged: resetFrames = 3
    onRowsChanged: resetFrames = 3

    Rectangle { anchors.fill: parent; color: "black" }

    component FieldTexture: ShaderEffectSource {
        hideSource: true
        visible: false
        smooth: false
        format: ShaderEffectSource.RGBA16F
        wrapMode: ShaderEffectSource.Repeat
        textureSize: main.grid
    }

    // one time step
    Item {
        id: stepItem
        width: main.cols; height: main.rows
        ShaderEffect {
            id: stepFx
            anchors.fill: parent
            blending: false
            fragmentShader: Qt.resolvedUrl("../shaders/step.frag.qsb")
            property variant state: state
            property variant field: fieldV
            property size grid: main.grid
            property real omega: main.omega
            property real pull: main.pull
            property real alpha: main.alpha
            property real reset: main.resetFrames > 0 ? 1 : 0
            property real seed: 0
        }
    }
    FieldTexture { id: state; sourceItem: stepItem; recursive: true; live: false }

    // neighbourhood average: blur across, then down
    ShaderEffect {
        id: blurAcross
        width: main.cols; height: main.rows
        blending: false
        fragmentShader: Qt.resolvedUrl("../shaders/blur.frag.qsb")
        property variant src: state
        property point dir: Qt.point(1 / main.cols, 0)
        property real radius: main.cfg("reach", 8)
    }
    FieldTexture { id: fieldH; sourceItem: blurAcross }
    ShaderEffect {
        id: blurDown
        width: main.cols; height: main.rows
        blending: false
        fragmentShader: Qt.resolvedUrl("../shaders/blur.frag.qsb")
        property variant src: fieldH
        property point dir: Qt.point(0, 1 / main.rows)
        property real radius: main.cfg("reach", 8)
    }
    FieldTexture { id: fieldV; sourceItem: blurDown }

    ShaderEffect {
        id: show
        anchors.fill: parent
        blending: false
        fragmentShader: Qt.resolvedUrl("../shaders/show.frag.qsb")
        property variant state: state
        property variant field: fieldV
        property size grid: main.grid
        property size size: Qt.size(width, height)
        property real dotSize: 0.16 * main.cfg("dotSize", 100) / 100
        property real sharp: 10
        property real gain: 0.75 * main.cfg("brightness", 100) / 100
        property real px: Screen.devicePixelRatio
        property color calm: main.colours[0]
        property color wild: main.colours[1]
    }

    Text {
        anchors.centerIn: parent
        visible: show.status === ShaderEffect.Error || stepFx.status === ShaderEffect.Error
        color: "#888"
        width: parent.width * 0.6
        wrapMode: Text.Wrap
        text: "Chimera: a shader could not be loaded.\n" + show.log + stepFx.log
    }

    Timer {
        interval: Math.round(1000 / main.fps)
        running: true
        repeat: true
        onTriggered: {
            main.now = Date.now() / 1000 % 420
            if (main.resetFrames > 0) { stepFx.seed = Math.random() * 100; main.resetFrames-- }
            state.scheduleUpdate()
        }
    }
}
