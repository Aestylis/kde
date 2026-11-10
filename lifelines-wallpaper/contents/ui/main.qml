/* Lifelines — Plasma 6 animated wallpaper.
 * Every life is a thread of light. It begins thin, wanders, and if it meets another it may fall in beside it; two
 * threads that walk together shine brighter and weave around each other, and after a while a new thread may begin
 * between them, coloured a little like both. Some companions part. Every thread ends. What stays is its trace, which
 * fades slowly, and the living tend to follow the paths worn before them, so over hours the screen becomes a map of
 * where lives have gone, with roads nobody planned.
 *
 * Mechanics: a few dozen walkers are stepped eight times a second in plain JavaScript (cheap at this size). Their
 * newest stretch of path is stroked onto a texture that feeds back into itself and is dimmed a touch each step
 * (fade.frag), the same trail technique as the Meander wallpaper. Nothing is redrawn between steps.
 */
import QtQuick
import org.kde.plasma.plasmoid

WallpaperItem {
    id: main

    function cfg(name, def) {
        var v = main.configuration[name]
        return v === undefined ? def : v
    }
    readonly property int pool: 48                       // most threads that can exist
    readonly property int maxPop: Math.min(pool, cfg("population", 28))
    readonly property real pace: 7 * cfg("pace", 100) / 100          // px per second
    readonly property real longLife: cfg("lifespan", 10) * 60        // seconds
    readonly property real thread: Math.max(1.2, height / 600 * cfg("threadWidth", 100) / 100)
    readonly property real halfLife: cfg("persistence", 40) * 60 / 3.3   // seconds; "fade over" = down to a tenth
    readonly property int ticksPerSecond: 8

    property var lives: []          // the living
    property var memory: null       // coarse grid of how worn each patch of ground is
    property int memCols: 1
    property int memRows: 1
    readonly property real memCell: 36
    property real lapse: 0          // seconds of opening time-lapse left
    property int nextId: 1

    function rnd(a, b) { return a + Math.random() * (b - a) }
    function hueMix(a, b) {          // circular mean of two hues (0..1) plus a little drift of its own
        var x = Math.cos(a * 6.2832) + Math.cos(b * 6.2832), y = Math.sin(a * 6.2832) + Math.sin(b * 6.2832)
        var h = Math.atan2(y, x) / 6.2832 + rnd(-0.06, 0.06)
        return h - Math.floor(h)
    }
    function newLife(x, y, heading, hue) {
        return { id: nextId++, x: x, y: y, px: x, py: y, heading: heading, turn: 0, hue: hue, age: 0,
                 span: longLife * rnd(0.45, 1), speed: rnd(0.8, 1.2), mate: 0, together: 0, alone: 0,
                 restless: 0, weave: rnd(0, 6.28), rest: 0,
                 gx: rnd(0.08, 0.92) * width, gy: rnd(0.08, 0.92) * height, goalT: rnd(60, 240) }
    }
    function stranger() {            // someone arrives from beyond the edge
        var side = Math.floor(Math.random() * 4), x, y, h
        if (side === 0) { x = 2; y = rnd(0, height); h = rnd(-0.6, 0.6) }
        else if (side === 1) { x = width - 2; y = rnd(0, height); h = Math.PI + rnd(-0.6, 0.6) }
        else if (side === 2) { x = rnd(0, width); y = 2; h = Math.PI / 2 + rnd(-0.6, 0.6) }
        else { x = rnd(0, width); y = height - 2; h = -Math.PI / 2 + rnd(-0.6, 0.6) }
        return newLife(x, y, h, Math.random())
    }
    function worn(x, y) {
        var c = Math.floor(x / memCell), r = Math.floor(y / memCell)
        return c < 0 || r < 0 || c >= memCols || r >= memRows ? 0 : memory[r * memCols + c]
    }

    function restart() {
        if (width < 10 || height < 10) return
        memCols = Math.ceil(width / memCell); memRows = Math.ceil(height / memCell)
        var m = new Array(memCols * memRows)
        for (var i = 0; i < m.length; i++) m[i] = 0
        memory = m
        var ls = []
        for (i = 0; i < Math.max(6, maxPop / 2); i++) {
            var l = newLife(rnd(0.1, 0.9) * width, rnd(0.1, 0.9) * height, rnd(0, 6.28), Math.random())
            l.age = l.span * rnd(0, 0.6)
            ls.push(l)
        }
        lives = ls
        lapse = cfg("timelapse", true) ? 24 : 0
        trail.wipe = true
        trail.scheduleUpdate()
        ticker.restart()
    }

    // one step of everybody's life, dt seconds long
    function live(dt) {
        var ls = lives, n = ls.length, i, j, a, b, born = [], gone = []
        for (i = 0; i < n; i++) {
            a = ls[i]
            a.age += dt
            // wandering: the turn rate itself drifts
            a.turn = a.turn * Math.pow(0.5, dt / 6) + rnd(-1, 1) * 0.11 * Math.sqrt(dt)
            var steer = a.turn
            // everyone is on the way somewhere, and now and then changes their mind about where
            a.goalT -= dt
            var gdx = a.gx - a.x, gdy = a.gy - a.y
            if (a.goalT <= 0 || gdx * gdx + gdy * gdy < 70 * 70) {
                a.gx = rnd(0.08, 0.92) * width; a.gy = rnd(0.08, 0.92) * height; a.goalT = rnd(60, 240)
            }
            var toGoal = Math.atan2(gdy, gdx)
            steer += 0.3 * Math.atan2(Math.sin(toGoal - a.heading), Math.cos(toGoal - a.heading))
            // the nearest other life within sight
            var best = null, bd = 150 * 150
            if (a.restless > 0) a.restless -= dt
            else for (j = 0; j < n; j++) {
                if (j === i) continue
                b = ls[j]
                var dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy
                if (d2 < bd && b.restless <= 0) { bd = d2; best = b }
            }
            a.near = 0
            if (best) {
                var d = Math.sqrt(bd), to = Math.atan2(best.y - a.y, best.x - a.x)
                var dAlign = Math.atan2(Math.sin(best.heading - a.heading), Math.cos(best.heading - a.heading))
                var dTo = Math.atan2(Math.sin(to - a.heading), Math.cos(to - a.heading))
                var gap = thread * 5
                // walk the same way, close the distance, but keep a small gap
                steer += 0.35 * dAlign + (d > gap ? 0.35 * dTo * Math.min(1, (d - gap) / 60) : -0.25 * dTo)
                if (d < 40) {
                    a.near = 1
                    if (a.mate === best.id) a.together += dt; else { a.mate = best.id; a.together = 0 }
                    a.weave += dt * 0.7
                    // companions come to want the same destination
                    a.gx += (best.gx - a.gx) * Math.min(1, dt * 0.03); a.gy += (best.gy - a.gy) * Math.min(1, dt * 0.03)
                    steer += 0.22 * Math.sin(a.weave)          // companions weave around each other
                    // most companionships are for a while, not for good
                    if (Math.random() < dt / 400) { a.restless = rnd(60, 180); a.mate = 0; a.together = 0 }
                }
            }
            if (!a.near) a.alone += dt
            // the living lean towards ground that has been walked before
            var ahead = 46, lx = a.x + Math.cos(a.heading - 0.5) * ahead, ly = a.y + Math.sin(a.heading - 0.5) * ahead
            var rx = a.x + Math.cos(a.heading + 0.5) * ahead, ry = a.y + Math.sin(a.heading + 0.5) * ahead
            var wl = worn(lx, ly), wr = worn(rx, ry)
            steer += 0.16 * Math.max(-1, Math.min(1, (wr - wl) * 0.5))
            // the edge of the world turns everyone back, gently
            var mg = 90, ex = 0, ey = 0
            if (a.x < mg) ex = (mg - a.x) / mg; else if (a.x > width - mg) ex = -(a.x - width + mg) / mg
            if (a.y < mg) ey = (mg - a.y) / mg; else if (a.y > height - mg) ey = -(a.y - height + mg) / mg
            if (ex || ey) {
                var home = Math.atan2(ey, ex)
                steer += 0.9 * Math.hypot(ex, ey) * Math.atan2(Math.sin(home - a.heading), Math.cos(home - a.heading))
            }
            a.heading += Math.max(-0.9, Math.min(0.9, steer)) * dt
            var youth = Math.min(1, a.age / (a.span * 0.12)), dusk = Math.min(1, (a.span - a.age) / (a.span * 0.1))
            a.vigour = Math.max(0, Math.min(youth, dusk))       // thin at both ends of a life
            var v = pace * a.speed * (0.55 + 0.45 * a.vigour)
            a.px = a.x; a.py = a.y
            a.x += Math.cos(a.heading) * v * dt
            a.y += Math.sin(a.heading) * v * dt
            var c = Math.floor(a.x / memCell), r = Math.floor(a.y / memCell)
            if (c >= 0 && r >= 0 && c < memCols && r < memRows) memory[r * memCols + c] += dt
            // two who have walked together long enough may start a new life between them
            if (best && a.near && a.id < best.id && a.mate === best.id && best.mate === a.id && a.rest <= 0 && best.rest <= 0
                    && a.together > 70 && a.vigour > 0.99 && best.vigour > 0.99 && n + born.length < maxPop
                    && Math.random() < dt / 45) {
                var child = newLife((a.x + best.x) / 2, (a.y + best.y) / 2, a.heading + rnd(-0.3, 0.3), hueMix(a.hue, best.hue))
                child.restless = 0
                born.push(child)
                a.rest = best.rest = rnd(120, 300)
            }
            if (a.rest > 0) a.rest -= dt
            if (a.age >= a.span) gone.push(a)
        }
        if (gone.length) ls = ls.filter(function (l) { return l.age < l.span })
        for (i = 0; i < born.length; i++) ls.push(born[i])
        // nobody left to meet: strangers arrive
        if (ls.length < Math.max(5, maxPop * 0.3) && Math.random() < dt / 12) ls.push(stranger())
        lives = ls
        var fade = Math.pow(0.5, dt / (halfLife * 1.5))
        for (i = 0; i < memory.length; i++) memory[i] *= fade
        return { born: born, gone: gone }
    }

    function tick() {
        var real = 1 / ticksPerSecond, speedUp = 1
        if (lapse > 0) { speedUp = 30; lapse -= real }           // the opening: decades in seconds
        // several small steps so paths stay smooth; each life's path over the tick is stroked as up to three chords
        var path = {}, i, k, l, sub = speedUp > 1 ? 12 : 1, chords = speedUp > 1 ? 3 : 1
        for (i = 0; i < lives.length; i++) path[lives[i].id] = [[lives[i].x, lives[i].y]]
        var events = { born: [], gone: [] }
        for (i = 0; i < sub; i++) {
            var ev = live(real * speedUp / sub)
            events.born = events.born.concat(ev.born); events.gone = events.gone.concat(ev.gone)
            if ((i + 1) % (sub / chords) === 0) for (k = 0; k < lives.length; k++) {
                l = lives[k]
                if (path[l.id]) path[l.id].push([l.x, l.y]); else path[l.id] = [[l.x, l.y]]
            }
        }
        for (i = 0; i < pool; i++) {
            var head = heads.itemAt(i)
            l = i < lives.length ? lives[i] : null
            var pts = l ? path[l.id] : null
            var w = l ? thread * (0.45 + 0.55 * l.vigour) * (l.near ? 1.25 : 1) : 0
            // walking beside someone, a thread burns warmer and brighter; long alone, it dims
            var col = l ? Qt.hsla(l.hue, l.near ? 0.85 : 0.6,
                                  (l.near ? 0.62 : 0.5 - 0.14 * Math.min(1, l.alone / 240)) * (0.55 + 0.45 * l.vigour), 1) : "black"
            for (k = 0; k < 3; k++) {
                var seg = strokes.itemAt(i * 3 + k)
                if (!pts || k + 1 >= pts.length) { seg.visible = false; continue }
                var dx = pts[k + 1][0] - pts[k][0], dy = pts[k + 1][1] - pts[k][1]
                seg.thick = w
                seg.x = pts[k][0] - w / 2; seg.y = pts[k][1] - w / 2
                seg.width = Math.sqrt(dx * dx + dy * dy) + w
                seg.angle = Math.atan2(dy, dx) * 180 / Math.PI
                seg.color = col
                seg.visible = true
            }
            if (!l) { head.visible = false; continue }
            head.x = l.x; head.y = l.y
            head.size = thread * (1.6 + 1.6 * l.vigour)
            head.color = Qt.hsla(l.hue, 0.5, 0.8, 1)
            head.visible = lapse <= 0
        }
        if (lapse <= 0) {
            for (i = 0; i < events.gone.length; i++) flares.show(events.gone[i], false)
            for (i = 0; i < events.born.length; i++) flares.show(events.born[i], true)
        }
        fade.chance = Math.min(1, real * speedUp * Math.LN2 / halfLife / 0.008)
        fade.seed = Math.random() * 100
        trail.wipe = false
        trail.scheduleUpdate()
    }

    onWidthChanged: starter.restart()
    onHeightChanged: starter.restart()
    Timer { id: starter; interval: 300; onTriggered: main.restart() }
    Component.onCompleted: starter.restart()
    Timer { id: ticker; interval: 1000 / main.ticksPerSecond; repeat: true; onTriggered: main.tick() }

    Rectangle { anchors.fill: parent; color: "black" }

    // what gets rendered into the trail texture each step: the previous trail, dimmed, with the newest strokes on top
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
        Repeater {
            id: strokes
            model: main.pool * 3
            Rectangle {
                id: seg
                property real thick: 2
                property real angle: 0
                visible: false
                height: thick
                radius: thick / 2
                antialiasing: true
                transform: Rotation { origin.x: seg.thick / 2; origin.y: seg.thick / 2; angle: seg.angle }
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
        opacity: main.cfg("traceBrightness", 70) / 100
    }

    // the living
    Repeater {
        id: heads
        model: main.pool
        Item {
            property real size: 4
            property color color: "white"
            visible: false
            Rectangle { anchors.centerIn: parent; width: parent.size * 3.2; height: width; radius: width / 2; color: parent.color; opacity: 0.16 }
            Rectangle { anchors.centerIn: parent; width: parent.size; height: width; radius: width / 2; color: parent.color; antialiasing: true }
        }
    }

    // a ring where a life ends (opening outwards) or begins (closing inwards)
    Repeater {
        id: flares
        model: 8
        property int next: 0
        function show(l, birth) {
            var f = itemAt(next)
            next = (next + 1) % 8
            f.x = l.x; f.y = l.y
            f.color = Qt.hsla(l.hue, 0.6, 0.7, 1)
            f.from = birth ? 46 : 6; f.to = birth ? 6 : 70
            f.play.restart()
        }
        Item {
            id: flare
            property color color: "white"
            property real from: 6
            property real to: 70
            property real r: 6
            property alias play: play
            opacity: 0
            Rectangle {
                anchors.centerIn: parent
                width: parent.r * 2; height: width; radius: width / 2
                color: "transparent"; border.color: parent.color; border.width: 1.5; antialiasing: true
            }
            ParallelAnimation {
                id: play
                NumberAnimation { target: flare; property: "r"; from: flare.from; to: flare.to; duration: 5000; easing.type: Easing.OutCubic }
                SequentialAnimation {
                    NumberAnimation { target: flare; property: "opacity"; from: 0; to: 0.7; duration: 500 }
                    NumberAnimation { target: flare; property: "opacity"; to: 0; duration: 4500 }
                }
            }
        }
    }
}
