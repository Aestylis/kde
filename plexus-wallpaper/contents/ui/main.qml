/* Plexus — Plasma 6 animated wallpaper for OLED screens.
 * Slowly wandering dots that link up with lines when they come close and fill in as translucent triangles, in a few
 * depth layers with out-of-focus blur, on a true-black background. One fragment shader (../shaders/plexus.frag) draws
 * all of it; this file only feeds it (and ../shaders/cells.frag) the settings, a looping phase and where this screen sits in the desktop.
 *
 * Every monitor runs its own copy. They line up into one picture because (1) the phase comes from the wall clock, so
 * all copies are at the same moment, and (2) with "span" on, each copy draws its own window of one desktop-wide
 * pattern, addressed in logical pixels of the whole desktop layout.
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
    readonly property int fps: Math.max(12, Math.min(24, cfg("fps", 24)))
    property real speed: cfg("speed", 100) / 100
    property real dpr: Screen.devicePixelRatio

    // One loop of the whole animation at speed 100 %. Every motion in the shader is a whole multiple of this phase.
    readonly property real loopSeconds: 1800
    property real phase: 0
    function tick() { phase = (Date.now() / 1000 * speed / loopSeconds) % 1 }
    Component.onCompleted: tick()

    // Where this screen is inside the pattern, in logical px: its top-left corner and the size of the whole frame.
    // Not spanning: this screen is its own frame. Spanning, arrangement 0: the frame is the bounding box of all
    // screens as laid out in Display settings. Arrangement 1: the screens are treated as stacked top to bottom and
    // centred, in the order they have in Display settings (by y, then x) — for desks where the monitors physically
    // sit above each other but one of them is placed to the side in the logical layout.
    function placement(screens, myX, myY, myW, myH, spanning, arrangement) {
        var solo = { x: 0, y: 0, w: myW, h: myH }
        if (!spanning || !screens.length) return solo
        var i, s
        if (arrangement === 1) {
            var list = []
            for (i = 0; i < screens.length; i++) list.push(screens[i])
            list.sort(function (p, q) { return p.virtualY - q.virtualY || p.virtualX - q.virtualX })
            var maxW = 0, total = 0, mine = null
            for (i = 0; i < list.length; i++) {
                s = list[i]
                if (mine === null && s.virtualX === myX && s.virtualY === myY) mine = { y: total, w: s.width }
                maxW = Math.max(maxW, s.width); total += s.height
            }
            return mine ? { x: (maxW - mine.w) / 2, y: mine.y, w: maxW, h: total } : solo
        }
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
        for (i = 0; i < screens.length; i++) {
            s = screens[i]
            x0 = Math.min(x0, s.virtualX); y0 = Math.min(y0, s.virtualY)
            x1 = Math.max(x1, s.virtualX + s.width); y1 = Math.max(y1, s.virtualY + s.height)
        }
        return { x: myX - x0, y: myY - y0, w: x1 - x0, h: y1 - y0 }
    }
    readonly property var place: placement(Qt.application.screens, Screen.virtualX, Screen.virtualY, width, height,
                                           cfg("span", true), cfg("arrangement", 0))
    property point origin: Qt.point(place.x, place.y)
    property size frame: Qt.size(place.w, place.h)

    // Logical px per rendered texel of the in-focus layer. "Balanced" draws scaled (HiDPI) screens at logical
    // resolution and lets the compositor scale up; "Sharp" draws every device pixel.
    readonly property real baseTexel: cfg("renderScale", 0) === 1 ? 1 / dpr : Math.max(1, 1 / dpr)
    readonly property int layerCount: cfg("layers", 3)
    readonly property real blurPx: cfg("blur", 50) * 0.24

    Rectangle { anchors.fill: parent; color: "black" }

    // dot density is counted per 2560x1440 of desktop so that every monitor gets the same cell size
    readonly property real cell: Math.sqrt(2560 * 1440 / Math.max(10, cfg("dots", 110)))

    // Pass 1: where every dot is, whether it exists and its colour, once per cell, into a small float texture.
    ShaderEffect {
        id: cellFx
        width: 128; height: 512
        blending: false
        fragmentShader: Qt.resolvedUrl("../shaders/cells.frag.qsb")
        property real phase: main.phase
        property real cell: main.cell
        property point origin: main.origin
        property size size: Qt.size(main.width, main.height)
        property size frame: main.frame
        property real coverage: main.cfg("coverage", 50) / 100
        property real layoutMode: main.cfg("layoutMode", 1)
        property real colorMix: main.cfg("colorMix", 25) / 100
    }
    ShaderEffectSource {
        id: cellTex
        sourceItem: cellFx
        hideSource: true
        visible: false
        smooth: false
        format: ShaderEffectSource.RGBA16F
        textureSize: Qt.size(128, 512)
    }

    // Pass 2: the shader is instanced three times, each drawing some of the depth layers additively over the black rectangle.
    // The soft, out-of-focus layers are rendered into smaller textures and scaled up: nobody can tell, and it is cheap.
    component Plexus: ShaderEffect {
        property real texel: main.baseTexel      // logical px per rendered texel
        property real layerMask: 1
        anchors.fill: parent
        fragmentShader: Qt.resolvedUrl("../shaders/plexus.frag.qsb")
        layer.enabled: texel * main.dpr > 1.01
        layer.smooth: true
        layer.textureSize: Qt.size(Math.ceil(width / texel), Math.ceil(height / texel))

        property real phase: main.phase
        property point origin: main.origin
        property size size: Qt.size(width, height)
        property size frame: main.frame
        property real cell: main.cell
        property variant cells: cellTex
        property real linkDist: main.cfg("linkDist", 75) / 100 * 1.5
        property real dotR: 2.2 * main.cfg("dotSize", 100) / 100
        property real lineW: 0.55 * main.cfg("lineWidth", 100) / 100
        property real lineGain: main.cfg("lineBright", 100) / 100
        property real triAmount: main.cfg("triAmount", 60) / 100
        property real triOpacity: main.cfg("triOpacity", 60) / 100
        property real blur: main.blurPx
        property real glow: main.cfg("glow", 30) / 100
        property real nColors: main.cfg("fourColors", true) ? 4 : 3
        property real gain: main.cfg("brightness", 100) / 100
        property color c1: main.cfg("color1", "#3b3bff")
        property color c2: main.cfg("color2", "#8a3cff")
        property color c3: main.cfg("color3", "#e040fb")
        property color c4: main.cfg("color4", "#ff2d87")
    }

    // far, slightly soft layer
    Plexus { visible: main.layerCount >= 3; layerMask: 4; texel: Math.max(main.baseTexel, main.blurPx * 0.3 >= 3 ? 2 : 0) }
    // near, blurred layers
    Plexus {
        visible: main.layerCount >= 2
        layerMask: main.layerCount >= 4 ? 10 : 2
        texel: Math.max(main.baseTexel, Math.min(4, Math.floor(main.blurPx / 4)))
    }
    // the layer in focus
    Plexus { id: fx; layerMask: 1 }

    // If the shader cannot be loaded, say so on the wallpaper instead of showing plain black.
    Text {
        anchors.centerIn: parent
        visible: fx.status === ShaderEffect.Error
        color: "#888"
        width: parent.width * 0.6
        wrapMode: Text.Wrap
        text: "Plexus: the shader could not be loaded.\n" + fx.log
    }

    Timer {
        interval: Math.round(1000 / main.fps)
        running: main.speed > 0
        repeat: true
        onTriggered: main.tick()
    }
}
