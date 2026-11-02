/* Silent County Road — Plasma 6 animated wallpaper.
 * The whole scene is one GPU fragment shader (../shaders/silentroad.frag, or sky.frag for a monitor above):
 * procedural pixel art, 24-colour palette, ordered dithering, hash-based snow, slow fog. The CPU only works out the
 * time of day:
 *   - the real sun for the configured location (default Grants Pass, OR): elevation, azimuth, today's sunrise/sunset,
 *     driving day / twilight / dawn-vs-dusk colouring and the sun's position;
 *   - the lamps: off by day, switched on (with a startup stutter) when the sun is ~3 deg above the horizon at dusk;
 *   - the snow timeline: snow builds from sunset to a peak in the small hours; ~25 min after sunrise a plough clears
 *     the road over ~2 minutes; the fog lifts by late morning; a little snow settles again through the afternoon.
 *   - the real lunar phase for the sky screen.
 * Both screens share one wall clock, so wind, snowfall, flicker and the plough line up across monitors.
 */
import QtQuick
import QtQuick.Window
import org.kde.plasma.plasmoid

WallpaperItem {
    id: main

    readonly property int pixelSize: main.configuration.pixelSize || 4
    readonly property int fps: main.configuration.fps || 24
    readonly property real snowAmt: Math.min(1, (main.configuration.snowDensity !== undefined ? main.configuration.snowDensity : 50) / 100 * (liveOn ? liveSnowF : 1))
    readonly property real fogAmt: (main.configuration.fogDensity !== undefined ? main.configuration.fogDensity : 50) / 50
    readonly property real windAmt: (main.configuration.windStrength !== undefined ? main.configuration.windStrength : 50) / 50 * (liveOn ? liveWindF : 1)

    // ------------------------------------------------------------------ live weather (opt-in): open-meteo.com, every 15 min
    // wind speed / gusts -> wind strength (5 m/s feels like the default), wind direction -> which way things blow (the view
    // faces the sun's arc, roughly south, so screen-right is west), snowfall -> flake density, cloud cover -> clouds.
    // Readings older than 2 h are ignored (procedural weather returns).
    readonly property bool liveWeather: main.configuration.liveWeather === true
    property bool liveOn: false
    property real liveWindF: 1
    property real liveSnowF: 1
    property real liveCloud: -1
    property real liveThick: 1
    property real windDirEff: 1
    property var wx: null
    property real wxAt: 0
    function fetchWeather() {
        if (!liveWeather) return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status === 200) {
                try { wx = JSON.parse(xhr.responseText).current; wxAt = Date.now() } catch (err) {}
            }
            applyWeather()
        }
        xhr.open("GET", "https://api.open-meteo.com/v1/forecast?latitude=" + latitude.toFixed(3) + "&longitude=" + longitude.toFixed(3)
                 + "&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,snowfall,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&wind_speed_unit=ms")
        xhr.send()
    }
    function applyWeather() {
        var ok = liveWeather && wx !== null && Date.now() - wxAt < 2 * 3600 * 1000
        liveOn = ok
        if (!ok) { liveCloud = -1; windDirEff = 1; return }
        var lateral = Math.sin(wx.wind_direction_10m * Math.PI / 180)      // + : blowing toward the west = screen right
        var speed = Math.max(wx.wind_speed_10m, 0.6 * wx.wind_gusts_10m)
        liveWindF = Math.min(2, speed / 5) * (0.4 + 0.6 * Math.abs(lateral))
        windDirEff = lateral >= 0 ? 1 : -1
        liveSnowF = wx.snowfall > 0 ? Math.min(2, 0.6 + 2.0 * wx.snowfall) : 0.12   // not snowing: a few stray flakes
        liveCloud = Math.max(0, Math.min(1, wx.cloud_cover / 100))
        // how thick: low cloud is dense, mid fairly, high cirrus a thin veil (the moon and stars show through)
        var lo = wx.cloud_cover_low || 0, mi = wx.cloud_cover_mid || 0, hi = wx.cloud_cover_high || 0
        liveThick = (lo + mi + hi) > 0 ? Math.max(0.3, (lo * 1.0 + mi * 0.8 + hi * 0.38) / (lo + mi + hi)) : 1   // cover-weighted thickness
    }
    onLiveWeatherChanged: { if (liveWeather) fetchWeather(); else applyWeather() }
    Timer { interval: 15 * 60 * 1000; running: main.liveWeather; repeat: true; triggeredOnStart: true; onTriggered: main.fetchWeather() }
    readonly property real flickerAmt: (main.configuration.flicker !== undefined ? main.configuration.flicker : 50) / 50
    readonly property int scene: main.configuration.scene || 0               // 0 road, 1 sky (for a monitor above)
    readonly property int erosionMode: main.configuration.erosionMode || 0   // 0 follows the day, 1 always clear, 2 always buried
    readonly property real latitude: main.configuration.latitude !== undefined ? main.configuration.latitude : 42.51
    readonly property real longitude: main.configuration.longitude !== undefined ? main.configuration.longitude : -123.39
    // writing a fresh timestamp here (settings button, or a script) sends the plough through right away
    readonly property string ploughNow: main.configuration.ploughNow || ""
    property real forcedPloughMs: 0
    readonly property int previewHour: main.configuration.previewHour !== undefined ? main.configuration.previewHour : -1

    // ------------------------------------------------------------------ clocks
    function clockSeconds() { return (Date.now() / 1000) % 86400 }
    // "now" for the scene: the real time, or today at the preview hour (the minutes keep running so it still moves)
    function sceneDate() {
        var d = new Date()
        if (previewHour >= 0) d.setHours(previewHour)
        return d
    }

    // ------------------------------------------------------------------ sun (NOAA-style low-precision formulas)
    function sunPosition(date) {
        var rad = Math.PI / 180
        var n = date.getTime() / 86400000 + 2440587.5 - 2451545.0          // days since J2000
        var L = (280.460 + 0.9856474 * n) % 360
        var g = ((357.528 + 0.9856003 * n) % 360) * rad
        var lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad
        var eps = (23.439 - 0.0000004 * n) * rad
        var ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))
        var dec = Math.asin(Math.sin(eps) * Math.sin(lambda))
        var gmst = (18.697374558 + 24.06570982441908 * n) % 24
        var H = (gmst * 15 + longitude) * rad - ra                          // hour angle
        var lat = latitude * rad
        var elev = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H))
        var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI
        return { elev: elev / rad, az: (az / rad + 360) % 360 }
    }
    // the moon (low-precision Meeus terms, good to ~1 deg): elevation and azimuth, same conventions as the sun
    function moonPosition(date) {
        var rad = Math.PI / 180
        var n = date.getTime() / 86400000 + 2440587.5 - 2451545.0
        var L = 218.316 + 13.176396 * n, M = (134.963 + 13.064993 * n) * rad, F = (93.272 + 13.229350 * n) * rad
        var lam = (L + 6.289 * Math.sin(M)) * rad, beta = 5.128 * Math.sin(F) * rad, eps = 23.439 * rad
        var ra = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lam))
        var dec = Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lam))
        var gmst = (18.697374558 + 24.06570982441908 * n) % 24
        var H = (gmst * 15 + longitude) * rad - ra, lat = latitude * rad
        var elev = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H))
        var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI
        return { elev: elev / rad, az: (az / rad + 360) % 360 }
    }
    // today's sunrise / sunset as minutes after local midnight (scan in 2-minute steps; -0.833 deg = standard horizon)
    function sunTimes(date) {
        var d0 = new Date(date); d0.setHours(0, 0, 0, 0)
        var riseT = d0.getTime() + 7 * 3600000, setT = d0.getTime() + 17 * 3600000, prev = sunPosition(d0).elev
        for (var m = 2; m <= 1500; m += 2) {                     // 25 h covers the daylight-saving change day
            var t = d0.getTime() + m * 60000
            var e = sunPosition(new Date(t)).elev
            if (prev < -0.833 && e >= -0.833) riseT = t
            if (prev >= -0.833 && e < -0.833) setT = t
            prev = e
        }
        // report as LOCAL clock minutes (elapsed minutes since midnight are off by an hour on DST-change days)
        function clockMin(t) { var x = new Date(t); return x.getHours() * 60 + x.getMinutes() }
        return { rise: clockMin(riseT), set: clockMin(setT),
                 azRise: sunPosition(new Date(riseT)).az, azSet: sunPosition(new Date(setT)).az }
    }
    function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

    // ------------------------------------------------------------------ traffic
    // Deterministic from the clock (5-minute slots), so every screen and every restart agrees on what passed when.
    function rnd(k, salt) {
        var x = Math.imul((k | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt, 0x27d4eb2d)
        x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15
        return (x >>> 0) / 4294967296
    }
    readonly property int slotSec: 300
    function trafficChance(hour) {               // busy commutes, sparse small hours
        if (hour >= 1 && hour < 5) return 0.10
        if ((hour >= 6 && hour < 9) || (hour >= 16 && hour < 19)) return 0.62
        if (hour >= 22 || hour < 1) return 0.22
        return 0.42
    }
    function vehicleIn(k) {                      // the vehicle of slot k (or null)
        var d = new Date(k * slotSec * 1000)
        var hour = previewHour >= 0 ? previewHour : d.getHours()
        if (rnd(k, 1) > trafficChance(hour)) return null
        var dur = 22 + rnd(k, 3) * 14
        return { start: k * slotSec + rnd(k, 2) * (slotSec - dur - 5), dur: dur,
                 dir: rnd(k, 4) < 0.5 ? 1 : -1, type: Math.floor(rnd(k, 5) * 3), col: Math.floor(rnd(k, 6) * 5) }
    }
    // A vehicle yields to wildlife: while an animal is on the road just ahead of it, the vehicle's own clock slows to a
    // stop (curVeh.hold collects the time spent waiting), then it pulls away once the road is clear.
    property var curVeh: null
    property real vehLast: 0
    property real vehSpeed: 1
    function vehDepth(p, dir) { return dir > 0 ? 1.0 / (1.0 + 9.0 * p) : 1.15 / (10.0 - 9.0 * p) }   // as in the shader
    function animalBlocks(tv, dir) {
        var a = fx.animal
        if (a.x < -50) return false
        var d = a.y, A = Math.max(1, width / Math.max(1, height))
        var cx = A * (0.36 + 0.05 * d + 0.02 * d * d), hw = 0.0005 + 0.26 * d
        if (Math.abs(a.x - cx) > hw + (a.w > 0.5 ? 0.06 : 0.11) * d) return false   // not on (or about to step onto) the road
        return dir > 0 ? (tv > d && tv < d * 1.5 + 0.04)                         // driving away: animal just in front
                       : (tv < d && tv > d / 1.5 - 0.03)                         // oncoming: same, nearer the viewer
    }
    function updateTraffic() {
        var now = Date.now() / 1000
        var dt = Math.min(1, Math.max(0, now - vehLast)); vehLast = now
        var k = Math.floor(now / slotSec)
        var active = null
        if (curVeh && now <= curVeh.start + curVeh.dur + curVeh.hold) active = curVeh   // a waiting vehicle may outlast its slot
        else if (forcedCar) {                                 // "Send a car": a random vehicle right now
            var r = Math.random()
            active = { start: now, dur: 22 + 14 * Math.random(), dir: r < 0.5 ? 1 : -1, type: Math.floor(Math.random() * 3),
                       col: Math.floor(Math.random() * 5), hold: 0 }
            vehSpeed = 1; forcedCar = false
        }
        else {
            var v = vehicleIn(k)
            if (v && now >= v.start && now <= v.start + v.dur) { v.hold = 0; active = v; vehSpeed = 1 }
        }
        curVeh = active
        if (active) {
            var p = (now - active.start - active.hold) / active.dur
            var target = animalBlocks(vehDepth(p, active.dir), active.dir) ? 0 : 1
            vehSpeed += Math.max(-dt / 0.8, Math.min(dt / 1.5, target - vehSpeed))        // brake ~0.8 s, pull away ~1.5 s
            active.hold += dt * (1 - vehSpeed)
            p = (now - active.start - active.hold) / active.dur
            fx.veh = Qt.vector4d(Math.min(1, Math.max(0, p)), active.dir, active.type, active.col)
        } else fx.veh = Qt.vector4d(-1, 0, 0, 0)
        // ruts from vehicles in the last ~45 minutes, refilling with snow over ~10 minutes
        var tr = 0, tl = 0
        for (var j = 0; j <= 9; j++) {
            var u = vehicleIn(k - j)
            if (!u) continue
            var age = now - (u.start + u.dur)
            if (age < 0) continue
            var st = Math.exp(-age / 600)
            if (u.dir > 0) tr = Math.max(tr, st); else tl = Math.max(tl, st)
        }
        fx.tracks = Qt.vector4d(tr, tl, 0, 0)
    }

    // ------------------------------------------------------------------ wind knocking snow off the wires
    // An exact copy of the shader's wind (same integer hash), so QML knows when the gusts hit. The strongest gust since
    // sunset sets a "knock level": every wire section whose fragility is below it has been shaken loose and stays bare
    // until the night's snow rebuilds it. Rebuilt by scanning the day on startup, then tracked tick by tick.
    function pcg(v) {
        var st = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0
        var w = Math.imul(((st >>> ((st >>> 28) + 4)) ^ st) >>> 0, 277803737) >>> 0
        return ((w >>> 22) ^ w) >>> 0
    }
    function wnoise(x, salt) {
        var i = Math.floor(x), f = x - i
        f = f * f * (3 - 2 * f)
        var a = pcg((i + salt) >>> 0) / 4294967295, b = pcg((i + 1 + salt) >>> 0) / 4294967295
        return a + (b - a) * f
    }
    function windXjs(t) { return t * 2.4 + 41 * wnoise(t / 40, 7001) + 5 * wnoise(t / 9, 9113) }
    function gustJs(t) { return Math.max(-0.5, Math.min(1, (windXjs(t + 0.5) - windXjs(t - 0.5) - 2.4) / 1.2)) }
    function knockLevel(epochSec) {
        if (windAmt < 0.01) return 0
        var c = epochSec % 86400 - 0.8 * 2.0 * Math.max(1, width / Math.max(1, height))   // the wires' place in the gust's path
        return Math.max(0, Math.min(1, (gustJs(c) - 0.45) / 0.55)) * 0.45 * Math.min(windAmt, 1.5)
    }
    property real knockFrom: -1
    property real knockMax: 0
    property var knockHist: []
    function updateWindKnock() {
        var nowMs = Date.now(), now = nowMs / 1000
        var d = new Date(nowMs)
        var localSec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
        var back = localSec - times.set * 60
        if (back < 0) back += 86400
        var setEpoch = Math.floor(now - back)                                  // the last sunset: fresh snow starts building
        if (setEpoch !== knockFrom) {
            knockFrom = setEpoch; knockMax = 0
            for (var t = setEpoch; t < now; t += 3) knockMax = Math.max(knockMax, knockLevel(t))
            knockHist = [[now, knockMax]]
        }
        knockMax = Math.max(knockMax, knockLevel(now))
        var h = knockHist; h.push([now, knockMax])
        while (h.length > 2 && h[1][0] <= now - 1.6) h.shift()
        knockHist = h
        fx.windKnock = Qt.vector4d(knockMax, h[0][1], 0, 0)
    }

    // ------------------------------------------------------------------ birds
    // 8-minute slots; a flock (3-7) may arrive by day / dusk, perch 1-4 minutes, then leave.
    readonly property int birdSlot: 480
    function flockIn(k) {
        var start = k * birdSlot + rnd(k, 21) * 60
        var sp = sunPosition(new Date(start * 1000))
        if (sp.elev < -4 || rnd(k, 22) > 0.55) return null
        return { start: start, n: 3 + Math.floor(rnd(k, 23) * 5), side: rnd(k, 24) < 0.5 ? 1 : -1,
                 perch: 60 + rnd(k, 25) * 180, seed: k % 997 }
    }
    function updateBirds() {
        var now = Date.now() / 1000
        if (previewHour >= 0) {                        // keep the preview's sun: shift "now" to the preview hour
            var d = sceneDate(); now = d.getTime() / 1000
        }
        var k = Math.floor(now / birdSlot), f = null
        for (var j = 0; j <= 1 && !f; j++) {
            var c = flockIn(k - j)
            if (c && now >= c.start && now < c.start + c.perch + 22) f = c
        }
        fx.birds = f ? Qt.vector4d(now - f.start, f.n, f.side, f.perch) : Qt.vector4d(-1, 0, 0, 0)
        fx.birdSeed = f ? f.seed : 0
    }

    // ------------------------------------------------------------------ wildlife
    // 20-minute slots; a deer by day (and dawn/dusk), a fox at night. Real-world speed and size by depth (road scale: 1 m = 0.087 t).
    readonly property int animalSlot: 1200
    readonly property string carNow: main.configuration.carNow || ""
    property bool forcedCar: false
    onCarNowChanged: { var t = parseInt(carNow); if (t > 0 && Math.abs(Date.now() - t) < 10 * 60000) forcedCar = true }
    readonly property string animalNow: main.configuration.animalNow || ""
    property real forcedAnimalStart: 0
    onAnimalNowChanged: { var t = parseInt(animalNow); if (t > 0 && Math.abs(Date.now() - t) < 10 * 60000) forcedAnimalStart = Date.now() / 1000 }
    function animalEvent(k, start) {
        var A = Math.max(1, width / Math.max(1, height))
        var sp = sunPosition(previewHour >= 0 ? sceneDate() : new Date(start * 1000))
        var fox = sp.elev < -6
        if (!fox && sp.elev < -3) return null                      // deep dusk: neither
        var depth = fox ? 0.50 + 0.40 * rnd(k, 42) : 0.24 + 0.36 * rnd(k, 42)
        var mps = fox ? 0.9 : 1.1
        var v = mps * 0.087 * depth                                  // uv per second
        var dist = A + 0.3
        var walk = dist / v
        var p1 = 7 + rnd(k, 45) * 6, p2 = 7 + rnd(k, 46) * 6
        return { start: start, fox: fox, stride: fox ? 0.75 : 1.4, depth: depth, dir: rnd(k, 43) < 0.5 ? 1 : -1, v: v, A: A,
                 walk: walk, p1: p1, p2: p2, total: walk + p1 + p2, buck: rnd(k, 44) < 0.5 ? 1 : 0 }
    }
    function updateAnimal() {
        var now = Date.now() / 1000, ev = null
        if (forcedAnimalStart > 0 && now - forcedAnimalStart < 400) {
            ev = animalEvent(Math.floor(forcedAnimalStart), forcedAnimalStart)
            if (ev && now > ev.start + ev.total) { ev = null; forcedAnimalStart = 0 }
        }
        if (!ev) {
            var k = Math.floor(now / animalSlot)
            for (var j = 0; j <= 1 && !ev; j++) {
                var kk = k - j
                if (rnd(kk, 41) > 0.35) continue
                var c = animalEvent(kk, kk * animalSlot + rnd(kk, 40) * 300)
                if (c && now >= c.start && now <= c.start + c.total) ev = c
            }
        }
        if (!ev) { fx.animal = Qt.vector4d(-99, 0, 0, 0); return }
        // walk a third, pause (graze / sniff), walk a third, pause, walk out
        var e = now - ev.start, w1 = ev.walk * 0.33, w2 = ev.walk * 0.33
        var walked, pause = 0
        if (e < w1) walked = e
        else if (e < w1 + ev.p1) { walked = w1; pause = Math.min(1, Math.min(e - w1, w1 + ev.p1 - e)) }
        else if (e < w1 + ev.p1 + w2) walked = e - ev.p1
        else if (e < w1 + ev.p1 + w2 + ev.p2) { walked = w1 + w2; var e2 = e - (w1 + ev.p1 + w2); pause = Math.min(1, Math.min(e2, ev.p2 - e2)) }
        else walked = e - ev.p1 - ev.p2
        var x0 = ev.dir > 0 ? -0.15 : ev.A + 0.15
        fx.animal = Qt.vector4d(x0 + ev.dir * walked * ev.v, ev.depth, ev.dir, ev.fox ? 1 : 0)
        // walk cycle advances with distance walked (one cycle per stride), so the feet don't slide
        fx.animal2 = Qt.vector4d(2 * Math.PI * (walked * ev.v / (0.087 * ev.depth)) / ev.stride, pause, ev.buck, 0)
    }

    // real lunar phase: days since a known new moon (2000-01-06 18:14 UTC) over the synodic month
    function moonPhaseNow() {
        var days = (Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000
        var ph = (days / 29.530588853) % 1
        return ph < 0 ? ph + 1 : ph
    }

    // ------------------------------------------------------------------ the day's state (recomputed every few seconds)
    property var times: sunTimes(new Date())
    property real ploughStartMin: times.rise + 25
    property real lampsOnSinceMs: 0
    property bool lampsWereOn: false
    property bool started: false

    function update() {
        var d = sceneDate()
        var m = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
        var sp = sunPosition(d)
        fx.sunElev = sp.elev
        fx.day = smooth(-8, 6, sp.elev)
        fx.twi = Math.exp(-Math.pow((sp.elev - 1) / 5.5, 2))
        fx.rising = m < 12 * 60 ? 1 : 0
        fx.localHour = m / 60
        fx.sunX = Math.max(-0.2, Math.min(1.2, 0.08 + 0.84 * (sp.az - times.azRise) / Math.max(1, times.azSet - times.azRise)))
        // the anti-sun point (where Earth's shadow and the Belt of Venus sit at twilight) on the same screen mapping;
        // the sky spans the sun's day arc across the screen, so at dusk it lies just off the left edge, at dawn the right
        var span = Math.max(1, times.azSet - times.azRise), anti = (sp.az + 180) % 360
        if (anti - times.azRise > 180) anti -= 360
        fx.belt = Qt.vector4d(0.08 + 0.84 * (anti - times.azRise) / span, span / 0.84, 0, 0)
        // moonlight: azimuth relative to the view (which faces about south; + = west, screen-right), elevation, how lit
        var mp = moonPosition(d), ph = moonPhaseNow()
        fx.moon = Qt.vector4d(((mp.az - 180 + 540) % 360) - 180, mp.elev, (1 - Math.cos(2 * Math.PI * ph)) / 2, 0)

        // lamps: on below ~3 deg of sun elevation, with a startup stutter on switch-on
        var on = sp.elev < 3
        if (on && !lampsWereOn && started) lampsOnSinceMs = Date.now()   // stutter only on a real dusk switch-on
        lampsWereOn = on
        started = true
        fx.lamps = on ? 1 : 0
        fx.lampAge = on ? (lampsOnSinceMs ? (Date.now() - lampsOnSinceMs) / 1000 : 99) : 0

        // snow timeline
        var e = 0, cover = 0, plough = -1
        var wire = 0, meltStart = -2                       // wire snow; meltStart < -1 = not shedding
        var trees = 1                                      // snow on the spruces: builds overnight, melts by day to ~0.4
        if (erosionMode === 1) { e = 0; cover = 0; trees = 0.4 }
        else if (erosionMode === 2) { e = 1; cover = 1; wire = 1 }
        else {
            var nightLen = times.rise + 1440 - times.set
            var since = m >= times.set ? m - times.set : m + 1440 - times.set   // minutes since last sunset
            var build = smooth(0, nightLen * 0.62, since)                       // peaks in the small hours
            var P = ploughStartMin
            if (m >= P + 2 && m < times.set) {                                   // ploughed, fog lifting, light snow returning
                var peak = smooth(0, nightLen * 0.62, P + 1440 - times.set)
                e = peak * (1 - smooth(P, P + 180, m))
                cover = 0.03 + 0.12 * smooth(P + 60, times.set, m)
                // wires keep last night's snow, shedding it in sections from ~1 h after sunrise over ~4 h
                wire = peak
                trees = 0.4 + 0.6 * peak * (1 - smooth(times.rise + 60, times.rise + 420, m))   // melts over ~6 h of daylight
                var nowLocalSec = m * 60
                meltStart = ((clockSeconds() - (nowLocalSec - (times.rise + 60) * 60)) % 86400 + 86400) % 86400
            } else {
                e = build
                cover = build
                wire = build
                trees = 0.4 + 0.6 * build
                if (m >= P && m < P + 2) plough = (m - P) / 2                    // the plough's two minutes
            }
        }
        // a forced run: fresh snow on the road ahead of the plough, cleared behind it, over ~2 minutes
        var fp = (Date.now() - forcedPloughMs) / 120000
        if (forcedPloughMs > 0 && fp >= 0 && fp <= 1) { plough = fp; cover = 1; e = Math.max(e, 0.35) }
        else if (forcedPloughMs > 0 && fp > 1 && fp < 1.5) cover = Math.min(cover, 0.03)   // stays clear a while after
        fx.erosion = e
        fx.wireSnow = wire
        fx.treeSnow = trees
        fx.meltStart = meltStart
        fx.roadCover = cover
        fx.plough = plough
    }

    Rectangle { anchors.fill: parent; color: "#07090d" }

    Image {                                   // CC0 wildlife sprites (contents/images/CREDITS.md)
        id: wildlifeAtlas
        source: Qt.resolvedUrl("../images/wildlife.png")
        visible: false
        smooth: false
    }

    Image {                                   // procedurally grown spruces, relit in the shader (tools/gen_trees.py)
        id: treeAtlasImg
        source: Qt.resolvedUrl("../images/trees.png")
        visible: false
        smooth: false
    }

    Image {                                   // farmhouse, cabin, barn, cottage: relit in the shader (tools/gen_houses.py)
        id: houseAtlasImg
        source: Qt.resolvedUrl("../images/houses.png")
        visible: false
        smooth: false
    }


    ShaderEffect {
        id: fx
        property var atlas: wildlifeAtlas
        property var treeAtlas: treeAtlasImg
        property var houseAtlas: houseAtlasImg
        anchors.fill: parent
        property real time: main.clockSeconds()
        // block size in PHYSICAL pixels, so a scaled monitor gets the same-size pixels as an unscaled one
        property real pix: main.pixelSize / Math.max(1, Screen.devicePixelRatio)
        property real moonPhase: main.moonPhaseNow()
        property real snowAmt: main.snowAmt
        property real fogAmt: main.fogAmt
        property real windAmt: main.windAmt
        property real windDir: main.windDirEff
        property real liveCloud: main.liveCloud
        property real liveThick: main.liveThick
        property real erosion: 0
        property real flickerAmt: main.flickerAmt          // 0..2: up to 1 = depth, beyond = more often
        property real day: 0
        property real twi: 0
        property real rising: 0
        property real lamps: 1
        property real lampAge: 99
        property real roadCover: 0
        property real plough: -1
        property real sunX: 0.5
        property real sunElev: -20
        property vector4d veh: Qt.vector4d(-1, 0, 0, 0)
        property vector4d tracks: Qt.vector4d(0, 0, 0, 0)
        property vector4d birds: Qt.vector4d(-1, 0, 0, 0)
        property real birdSeed: 0
        property real wireSnow: 0
        property real treeSnow: 1
        property real meltStart: -2
        property real meltDur: 4 * 3600
        property vector4d windKnock: Qt.vector4d(0, 0, 0, 0)
        property vector4d animal: Qt.vector4d(-99, 0, 0, 0)
        property vector4d animal2: Qt.vector4d(0, 0, 0, 0)
        property real localHour: 12
        property vector4d belt: Qt.vector4d(-9, 160, 0, 0)
        property vector4d moon: Qt.vector4d(0, -90, 0, 0)
        property size res: Qt.size(width, height)
        fragmentShader: Qt.resolvedUrl(main.scene === 1 ? "../shaders/sky.frag.qsb" : "../shaders/silentroad.frag.qsb")
        // Render at ART resolution (one fragment per pixel-art pixel) and scale up with nearest filtering:
        // identical image, ~pixelSize^2 times less GPU work than shading every screen pixel.
        layer.enabled: true
        layer.smooth: false
        layer.textureSize: Qt.size(Math.max(1, Math.floor(width / pix)), Math.max(1, Math.floor(height / pix)))
    }

    Component.onCompleted: update()
    onPreviewHourChanged: update()
    onPloughNowChanged: {
        var t = parseInt(ploughNow)
        if (t > 0 && Math.abs(Date.now() - t) < 10 * 60000) { forcedPloughMs = Date.now(); update() }
    }
    onErosionModeChanged: update()
    onLatitudeChanged: { times = sunTimes(new Date()); ploughStartMin = times.rise + 25; update() }
    onLongitudeChanged: { times = sunTimes(new Date()); ploughStartMin = times.rise + 25; update() }

    Timer {                                   // animation clock
        interval: Math.round(1000 / Math.max(5, main.fps))
        running: true
        repeat: true
        onTriggered: { fx.time = main.clockSeconds(); if (fx.plough >= 0) main.update(); if (main.scene === 0) { main.updateTraffic(); main.updateBirds(); main.updateAnimal(); main.updateWindKnock() } }
    }
    Timer {                                   // the day moves slowly: sun, lamps, snow timeline every 2 s
        interval: 2000
        running: true
        repeat: true
        onTriggered: main.update()
    }
    Timer {                                   // new day: recompute sunrise / sunset and the moon
        interval: 600000
        running: true
        repeat: true
        onTriggered: { main.times = main.sunTimes(new Date()); main.ploughStartMin = main.times.rise + 25; fx.moonPhase = main.moonPhaseNow() }
    }
}
