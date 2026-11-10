/* Meander — Plasma 6 animated wallpaper for OLED screens.
 * A river wanders across a black screen. Bends grow, tighten and cut themselves off into oxbow lakes, and every old
 * course stays behind as a slowly fading coloured band, like the survey maps that chart a river's past.
 *
 *   sim.js (in a WorkerScript thread) moves the river and reports its centreline a few times a second.
 *   The trail is a texture that feeds back into itself: each step it is dimmed a touch (fade.frag) and the river's
 *   current channel is stroked onto it in the colour of the current era. Eras change colour every few minutes, which
 *   is what turns a smooth sweep into distinct bands.
 *   On top of the trail the live river is drawn as a light line, and fresh oxbow lakes glow for a while.
 * Nothing is redrawn between simulation steps, so the wallpaper costs next to nothing.
 */
import QtQuick
import QtQuick.Shapes
import org.kde.plasma.plasmoid

WallpaperItem {
    id: main

    function cfg(name, def) {
        var v = main.configuration[name]
        return v === undefined ? def : v
    }
    readonly property var palettes: [
        ["#4f8fbf", "#c7785a", "#7fb069", "#d9b44a", "#9a6fb8", "#4fb3a6"],   // survey map
        ["#00e5ff", "#ff2d95", "#b4ff39", "#ffb300", "#8a5cff", "#00ffa3"],   // neon
        ["#ff5a1f", "#ffb000", "#c2185b", "#ff7a59", "#9c3112", "#ffd166"],   // ember
        ["#1e6fd9", "#39c0ed", "#7ce0d3", "#9fb4ff", "#2f4bd8", "#d6f0ff"],   // glacier
        ["#3b3bff", "#8a3cff", "#e040fb", "#ff2d87", "#5b6cff", "#b04bff"]    // ultraviolet
    ]
    readonly property var colours: palettes[Math.max(0, Math.min(palettes.length - 1, cfg("palette", 0)))]
    readonly property real cw: Math.max(4, height / 100 * cfg("channelWidth", 100) / 100)   // channel width, px
    readonly property int speed: Math.max(1, cfg("speed", 3))

    // time is counted in simulation steps; the river is redrawn eight times a second, `speed` steps each time
    readonly property int stepsPerSecond: 8
    readonly property int eraSteps: 960                 // one colour band; 40 seconds at speed 3
    readonly property real halfLifeSteps: cfg("persistence", 30) * 60 * stepsPerSecond / 3.3   // "fade over" = down to a tenth
    property int step: 0
    property bool ready: false
    property var pending: []                            // eras still to be painted during the opening
    property int pendingTotal: 0

    function eraColor(era) { return colours[((era % colours.length) + colours.length) % colours.length] }
    function points(flat) {
        var out = new Array(flat.length / 2)
        for (var i = 0; i < out.length; i++) out[i] = Qt.point(flat[2 * i], flat[2 * i + 1])
        return out
    }

    function restart() {
        if (width < 10 || height < 10) return
        ready = false
        stepTimer.stop(); introTimer.stop()
        pending = []
        riverLine.path = []; lakeLines.paths = []; strokeLines.paths = []; lakeStroke.paths = []
        trail.wipe = true
        trail.scheduleUpdate()
        // the opening history: 8 eras, simulated with 3x time steps so it takes a third of the work
        worker.sendMessage({ cmd: "init", w: width, h: height, cw: cw, seed: Math.floor(Math.random() * 1e9),
                             warm: 0, history: 2560, every: 5, era: eraSteps / 3, dt: 3 })
    }
    onWidthChanged: restartTimer.restart()
    onHeightChanged: restartTimer.restart()
    onCwChanged: restartTimer.restart()
    Timer { id: restartTimer; interval: 300; onTriggered: main.restart() }
    Component.onCompleted: restartTimer.restart()

    WorkerScript {
        id: worker
        source: "sim.js"
        onMessage: function (m) {
            if (m.kind === "init") {
                trail.wipe = false
                main.pending = m.eras
                main.pendingTotal = m.eras.length
                main.step = m.eras.length * main.eraSteps
                riverLine.path = main.points(m.pts)
                main.ready = true
                introTimer.start()
            } else if (m.kind === "step" && main.ready) {
                main.step += main.speed
                var pts = main.points(m.pts)
                riverLine.path = pts
                // stroke the channel, and any loop just cut off, onto the trail
                strokePath.strokeColor = main.eraColor(Math.floor(main.step / main.eraSteps))
                strokeLines.paths = [pts]
                if (m.oxbows.length) {
                    var loops = []
                    for (var i = 0; i < m.oxbows.length; i++) loops.push(main.points(m.oxbows[i]))
                    lakeStroke.paths = loops
                    lakeLines.paths = loops
                    lakeFade.restart()
                } else if (lakeStroke.paths.length) lakeStroke.paths = []
                fade.chance = Math.min(1, main.speed * Math.LN2 / main.halfLifeSteps / 0.008)
                fade.seed = (main.step % 1000) / 10
                trail.scheduleUpdate()
            }
        }
    }

    // the opening: the river's recent past is painted era by era, oldest first and dimmest
    Timer {
        id: introTimer
        interval: 140
        repeat: true
        onTriggered: {
            if (!main.pending.length) {
                stop()
                strokeLines.paths = []
                stepTimer.start()
                return
            }
            var era = main.pending.shift(), done = main.pendingTotal - main.pending.length - 1
            var age = (main.pendingTotal - done) * main.eraSteps
            var lines = []
            for (var i = 0; i < era.length; i++) lines.push(main.points(era[i]))
            strokePath.strokeColor = Qt.darker(main.eraColor(done), 1 / Math.pow(0.5, age / main.halfLifeSteps))
            fade.chance = 0
            strokeLines.paths = lines
            main.pending = main.pending
            trail.scheduleUpdate()
        }
    }
    Timer {
        id: stepTimer
        interval: 1000 / main.stepsPerSecond
        repeat: true
        onTriggered: worker.sendMessage({ cmd: "step", n: main.speed })
    }

    Rectangle { anchors.fill: parent; color: "black" }

    // what gets rendered into the trail texture each step: the previous trail, dimmed, with new strokes on top
    Item {
        id: trailContent
        width: main.width; height: main.height
        ShaderEffect {
            id: fade
            anchors.fill: parent
            blending: false
            visible: !trail.wipe
            fragmentShader: Qt.resolvedUrl("../shaders/fade.frag.qsb")
            property variant prev: trail
            property real chance: 0
            property real seed: 0
        }
        Shape {
            anchors.fill: parent
            preferredRendererType: Shape.CurveRenderer
            ShapePath {
                id: strokePath
                strokeWidth: main.cw
                strokeColor: "transparent"
                fillColor: "transparent"
                capStyle: ShapePath.RoundCap
                joinStyle: ShapePath.RoundJoin
                PathMultiline { id: strokeLines }
            }
            ShapePath {
                strokeWidth: main.cw
                strokeColor: Qt.lighter(strokePath.strokeColor, 1.25)
                fillColor: "transparent"
                capStyle: ShapePath.RoundCap
                joinStyle: ShapePath.RoundJoin
                PathMultiline { id: lakeStroke }
            }
        }
    }
    ShaderEffectSource {
        id: trail
        property bool wipe: false
        anchors.fill: parent
        sourceItem: trailContent
        recursive: true
        live: false
        hideSource: true
        format: ShaderEffectSource.RGBA16F
        textureSize: Qt.size(Math.max(1, main.width), Math.max(1, main.height))
        opacity: main.cfg("trailBrightness", 75) / 100
    }

    // the river now, and lakes that have just been cut off
    Shape {
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        opacity: main.cfg("riverBrightness", 100) / 100
        visible: main.ready
        ShapePath {
            strokeWidth: main.cw * 0.9
            strokeColor: Qt.rgba(1, 1, 1, 0.16)
            fillColor: "transparent"
            joinStyle: ShapePath.RoundJoin
            PathPolyline { path: riverLine.path }
        }
        ShapePath {
            strokeWidth: Math.max(1.5, main.cw * 0.28)
            strokeColor: "#f4fbff"
            fillColor: "transparent"
            joinStyle: ShapePath.RoundJoin
            PathPolyline { id: riverLine }
        }
    }
    Shape {
        id: lakes
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        opacity: 0
        visible: opacity > 0
        ShapePath {
            strokeWidth: main.cw * 0.9
            strokeColor: Qt.rgba(1, 1, 1, 0.55)
            fillColor: "transparent"
            joinStyle: ShapePath.RoundJoin
            PathMultiline { id: lakeLines }
        }
        NumberAnimation on opacity { id: lakeFade; running: false; from: 1; to: 0; duration: 45000; easing.type: Easing.OutQuad }
    }
}
