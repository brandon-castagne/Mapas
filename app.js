"use strict";
/* Mapa Sucre — app personal offline
   MapLibre GL + PMTiles (mapa.pmtiles se descarga una vez y queda guardado en el teléfono) */
(function () {
  var BASE = new URL(".", location.href).href;
  var DATA_URL = BASE + "data/mapa.pmtiles";
  var DATA_CACHE = "mapa-sucre-datos-v1"; // cambia este nombre si algún día reemplazas mapa.pmtiles
  var GLYPHS = BASE + "fonts/{fontstack}/{range}.pbf";
  var ATTR = '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
  var CENTER = [-65.2594, -19.0477];
  var BOUNDS = [[-65.40, -19.13], [-65.13, -18.93]];
  var LS_SITIOS = "mapa-sucre-sitios-v1";
  var LS_TEMA = "mapa-sucre-tema-v1";

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- utilidades ---------- */
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* almacenamiento no disponible */ } }
  function norm(s) { return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  var toastTimer;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  /* ---------- carga del mapa (archivo completo en memoria) ---------- */
  function readAll(resp, onProgress) {
    var total = Number(resp.headers.get("content-length")) || 0;
    if (!resp.body || !resp.body.getReader) return resp.arrayBuffer();
    var reader = resp.body.getReader(), chunks = [], got = 0;
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          var out = new Uint8Array(got), off = 0;
          chunks.forEach(function (c) { out.set(c, off); off += c.length; });
          return out.buffer;
        }
        chunks.push(r.value); got += r.value.length;
        onProgress(total ? Math.min(1, got / total) : null);
        return pump();
      });
    }
    return pump();
  }

  function loadMapFile() {
    var hasCache = typeof caches !== "undefined";
    var cachePromise = hasCache ? caches.open(DATA_CACHE).catch(function () { return null; }) : Promise.resolve(null);
    return cachePromise.then(function (cache) {
      var fromCache = cache ? cache.match(DATA_URL) : Promise.resolve(undefined);
      return fromCache.then(function (hit) {
        var cached = !!hit;
        var respP = hit ? Promise.resolve(hit) : fetch(DATA_URL);
        return respP.then(function (resp) {
          if (!resp.ok) throw new Error("HTTP " + resp.status);
          return readAll(resp, function (p) {
            if (p !== null) { $("barFill").style.width = Math.round(p * 100) + "%"; $("pct").textContent = Math.round(p * 100) + "%"; }
          });
        }).then(function (buf) {
          if (cache && !cached) {
            // guardar para usarlo sin internet la próxima vez
            cache.put(DATA_URL, new Response(buf, { headers: { "Content-Type": "application/octet-stream" } })).catch(function () {});
          }
          return buf;
        });
      });
    });
  }

  function MemorySource() { this.promise = loadMapFile(); }
  MemorySource.prototype.getKey = function () { return "mapa"; };
  MemorySource.prototype.getBytes = function (offset, length) {
    return this.promise.then(function (buf) { return { data: buf.slice(offset, offset + length) }; });
  };

  /* ---------- estilo (esquema OpenMapTiles) ---------- */
  var PAL = {
    light: {
      bg: "#f2efe9", grass: "#d3e6b4", wood: "#b9d5a0", farm: "#eee8c8", resid: "#ebe7df", indus: "#e6e0e8", hosp: "#f4dcdc",
      school: "#efe6d0", cemetery: "#cfe4c6", sport: "#c9e8bd", mil: "#ead9d9", water: "#a8cdee", building: "#dcd5c9", buildingLine: "#c9c0b1",
      casing: "#c7c0b3", trunk: "#f5c25d", primary: "#f8d987", secondary: "#fae8a6", tertiary: "#ffffff", minor: "#ffffff", service: "#fbfaf7",
      track: "#b9a57a", path: "#a5735f", rail: "#9a9a9a", boundary: "#9b8fb3",
      text: "#2b3038", halo: "#ffffff", muted: "#6b7280", waterText: "#3f77a8", peak: "#7a5c3a", roadText: "#3b4048"
    },
    dark: {
      bg: "#181d23", grass: "#1f2e24", wood: "#1b2b1f", farm: "#252a20", resid: "#1f242b", indus: "#252331", hosp: "#33252a",
      school: "#2a2720", cemetery: "#1e2d24", sport: "#203225", mil: "#2c2226", water: "#13303f", building: "#2a313a", buildingLine: "#3a434e",
      casing: "#0f1215", trunk: "#b48a3c", primary: "#96783f", secondary: "#7b6a49", tertiary: "#4a5460", minor: "#39424c", service: "#313941",
      track: "#6b5d3a", path: "#8a6b5a", rail: "#6b7280", boundary: "#6d6485",
      text: "#dfe5ec", halo: "#14181d", muted: "#9aa4b2", waterText: "#6fa8d6", peak: "#c9a878", roadText: "#c9d0d9"
    }
  };
  var FR = ["Noto Sans Regular"], FM = ["Noto Sans Medium"], FI = ["Noto Sans Italic"];
  var NAME = ["coalesce", ["get", "name"], ["get", "name:latin"]];

  function byClass(obj, def) {
    var a = ["match", ["get", "class"]];
    Object.keys(obj).forEach(function (k) { a.push(k.indexOf(",") > -1 ? k.split(",") : k, obj[k]); });
    a.push(def);
    return a;
  }
  function grow(obj, extra) { var o = {}; Object.keys(obj).forEach(function (k) { o[k] = obj[k] + extra; }); return o; }
  function zi() { return ["interpolate", ["exponential", 1.5], ["zoom"]].concat([].slice.call(arguments)); }

  var W10 = { trunk: 1.6, primary: 1.3, secondary: 1.1, tertiary: 0.8, minor: 0.5, service: 0.4 };
  var W14 = { trunk: 6, primary: 5, secondary: 4.2, tertiary: 3.5, minor: 2.6, service: 1.6 };
  var W18 = { trunk: 26, primary: 22, secondary: 19, tertiary: 17, minor: 14, service: 8 };
  function roadFillW() { return zi(10, byClass(W10, 0.5), 14, byClass(W14, 1.4), 18, byClass(W18, 5)); }
  function roadCasingW() { return zi(10, byClass(grow(W10, 0.6), 0.8), 14, byClass(grow(W14, 1.6), 2.4), 18, byClass(grow(W18, 3), 8)); }

  var LINE = ["==", ["geometry-type"], "LineString"];
  var MAJOR = ["trunk", "primary", "secondary", "tertiary", "motorway"];
  var isMajor = ["all", LINE, ["in", ["get", "class"], ["literal", MAJOR]]];
  var isMinor = ["all", LINE, ["in", ["get", "class"], ["literal", ["minor", "service"]]]];

  function emptyFC() { return { type: "FeatureCollection", features: [] }; }
  function sitiosFC(list) {
    return { type: "FeatureCollection", features: list.map(function (s) {
      return { type: "Feature", properties: { id: s.id, name: s.name }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } };
    }) };
  }
  function pinFC(pt) {
    return pt ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: pt } }] } : emptyFC();
  }

  function buildStyle(dark, sitiosData, pinData) {
    var c = dark ? PAL.dark : PAL.light;
    var halo = { "text-halo-color": c.halo, "text-halo-width": 1.6, "text-halo-blur": 0.3 };
    var layers = [
      { id: "bg", type: "background", paint: { "background-color": c.bg } },
      { id: "landcover", type: "fill", source: "omt", "source-layer": "landcover",
        paint: { "fill-color": byClass({ wood: c.wood, grass: c.grass, farmland: c.farm }, c.grass), "fill-opacity": 0.75 } },
      { id: "landuse", type: "fill", source: "omt", "source-layer": "landuse",
        paint: { "fill-color": byClass({ "residential,suburb,neighbourhood": c.resid, "industrial,commercial,retail,railway": c.indus, hospital: c.hosp,
          "school,university,college,kindergarten": c.school, cemetery: c.cemetery, "pitch,stadium,playground,track,theme_park,zoo": c.sport, military: c.mil }, c.resid) } },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": c.grass, "fill-opacity": 0.8 } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": c.water } },
      { id: "waterway", type: "line", source: "omt", "source-layer": "waterway",
        paint: { "line-color": c.water, "line-width": zi(8, byClass({ river: 1 }, 0.4), 14, byClass({ river: 3.5 }, 1.2), 18, byClass({ river: 12 }, 3.5)) } },
      { id: "aeroway-apron", type: "fill", source: "omt", "source-layer": "aeroway", filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": dark ? "#2a313a" : "#e3e0dc" } },
      { id: "aeroway-line", type: "line", source: "omt", "source-layer": "aeroway", filter: LINE,
        paint: { "line-color": dark ? "#3a434e" : "#d5d1cb", "line-width": zi(11, 1.5, 16, 14) } },
      { id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 13,
        paint: { "fill-color": c.building, "fill-outline-color": c.buildingLine, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 1] } },
      { id: "boundary", type: "line", source: "omt", "source-layer": "boundary", filter: ["<=", ["to-number", ["get", "admin_level"], 99], 8],
        paint: { "line-color": c.boundary, "line-width": 1.2, "line-dasharray": [4, 3] } },
      { id: "rail", type: "line", source: "omt", "source-layer": "transportation", filter: ["all", LINE, ["==", ["get", "class"], "rail"]], minzoom: 10,
        paint: { "line-color": c.rail, "line-width": 1.1, "line-dasharray": [3, 2] } },
      { id: "track", type: "line", source: "omt", "source-layer": "transportation", filter: ["all", LINE, ["==", ["get", "class"], "track"]], minzoom: 13,
        paint: { "line-color": c.track, "line-width": zi(13, 0.8, 18, 3), "line-dasharray": [3, 2] } },
      { id: "path", type: "line", source: "omt", "source-layer": "transportation", filter: ["all", LINE, ["in", ["get", "class"], ["literal", ["path", "pedestrian"]]]], minzoom: 14,
        paint: { "line-color": c.path, "line-width": zi(14, 0.7, 18, 2.4), "line-dasharray": [2, 2] } },
      { id: "road-minor-casing", type: "line", source: "omt", "source-layer": "transportation", filter: isMinor, minzoom: 12.5,
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.casing, "line-width": roadCasingW() } },
      { id: "road-major-casing", type: "line", source: "omt", "source-layer": "transportation", filter: isMajor, minzoom: 5,
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.casing, "line-width": roadCasingW() } },
      { id: "road-minor", type: "line", source: "omt", "source-layer": "transportation", filter: isMinor, minzoom: 12.5,
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": byClass({ service: c.service }, c.minor), "line-width": roadFillW() } },
      { id: "road-major", type: "line", source: "omt", "source-layer": "transportation", filter: isMajor, minzoom: 5,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": byClass({ "trunk,motorway": c.trunk, primary: c.primary, secondary: c.secondary }, c.tertiary), "line-width": roadFillW() } },

      { id: "poi-dot", type: "circle", source: "omt", "source-layer": "poi", minzoom: 16,
        filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "name"]],
        paint: {
          "circle-radius": zi(16, 3, 18, 6),
          "circle-color": byClass({
            "restaurant,fast_food,cafe,bar,bakery,ice_cream,pub": "#e2703a", "lodging,hotel": "#7b5ea7",
            "shop,grocery,supermarket,clothing_store,convenience,butcher,florist,alcohol_shop,stationery": "#3a7bd5",
            "hospital,pharmacy,doctors,dentist,clinic,veterinary": "#d64545", "school,college,university,kindergarten,library": "#b0863a",
            "place_of_worship": "#6a6aa5", "bank,atm": "#2e8b57"
          }, "#6b7280"),
          "circle-stroke-color": c.halo, "circle-stroke-width": 1.2
        } },
      { id: "poi-label", type: "symbol", source: "omt", "source-layer": "poi", minzoom: 16.5,
        filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "name"]],
        layout: { "text-field": NAME, "text-font": FR, "text-size": 11, "text-anchor": "top", "text-offset": [0, 0.7], "text-optional": true, "text-max-width": 8,
          "symbol-sort-key": ["coalesce", ["get", "rank"], 99] },
        paint: Object.assign({ "text-color": c.text }, halo) },

      { id: "road-label-major", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 12,
        filter: ["in", ["get", "class"], ["literal", MAJOR]],
        layout: { "symbol-placement": "line", "text-field": NAME, "text-font": FM, "text-size": zi(12, 10, 18, 14), "text-max-angle": 30, "symbol-spacing": 260 },
        paint: Object.assign({ "text-color": c.roadText }, halo) },
      { id: "road-label-minor", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 14.3,
        filter: ["!", ["in", ["get", "class"], ["literal", MAJOR]]],
        layout: { "symbol-placement": "line", "text-field": NAME, "text-font": FR, "text-size": zi(14, 10, 19, 14), "text-max-angle": 30, "symbol-spacing": 220 },
        paint: Object.assign({ "text-color": c.roadText }, halo) },
      { id: "housenumber", type: "symbol", source: "omt", "source-layer": "housenumber", minzoom: 17.5,
        layout: { "text-field": ["get", "housenumber"], "text-font": FR, "text-size": 10 },
        paint: { "text-color": c.muted, "text-halo-color": c.halo, "text-halo-width": 1.2 } },
      { id: "water-label", type: "symbol", source: "omt", "source-layer": "water_name", minzoom: 10,
        layout: { "text-field": NAME, "text-font": FI, "text-size": zi(10, 11, 16, 15) },
        paint: Object.assign({ "text-color": c.waterText }, halo) },
      { id: "peak-label", type: "symbol", source: "omt", "source-layer": "mountain_peak", minzoom: 11,
        layout: { "text-field": ["case", ["has", "ele"], ["concat", NAME, "\n", ["to-string", ["get", "ele"]], " m"], NAME], "text-font": FR, "text-size": 11, "text-anchor": "top", "text-offset": [0, 0.3] },
        paint: Object.assign({ "text-color": c.peak }, halo) },
      { id: "aerodrome-label", type: "symbol", source: "omt", "source-layer": "aerodrome_label", minzoom: 11,
        layout: { "text-field": NAME, "text-font": FR, "text-size": 11 }, paint: Object.assign({ "text-color": c.muted }, halo) },

      { id: "place-hamlet", type: "symbol", source: "omt", "source-layer": "place", minzoom: 12,
        filter: ["in", ["get", "class"], ["literal", ["hamlet", "isolated_dwelling", "neighbourhood", "quarter"]]],
        layout: { "text-field": NAME, "text-font": FR, "text-size": zi(12, 10, 17, 14), "text-max-width": 7 },
        paint: Object.assign({ "text-color": c.muted }, halo) },
      { id: "place-village", type: "symbol", source: "omt", "source-layer": "place", minzoom: 10,
        filter: ["in", ["get", "class"], ["literal", ["village", "suburb"]]],
        layout: { "text-field": NAME, "text-font": FM, "text-size": zi(10, 11, 16, 16), "text-max-width": 7 },
        paint: Object.assign({ "text-color": c.text }, halo) },
      { id: "place-city", type: "symbol", source: "omt", "source-layer": "place", minzoom: 5,
        filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
        layout: { "text-field": NAME, "text-font": FM, "text-size": zi(8, 14, 14, 24), "text-max-width": 8, "text-letter-spacing": 0.05 },
        paint: Object.assign({ "text-color": c.text }, halo) },

      { id: "sitios-dot", type: "circle", source: "sitios", paint: { "circle-radius": 8, "circle-color": "#e11d48", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 } },
      { id: "sitios-label", type: "symbol", source: "sitios", minzoom: 11,
        layout: { "text-field": ["get", "name"], "text-font": FM, "text-size": 12, "text-anchor": "bottom", "text-offset": [0, -1.1], "text-optional": true, "text-max-width": 9 },
        paint: Object.assign({ "text-color": c.text }, halo) },
      { id: "pin", type: "circle", source: "pin", paint: { "circle-radius": 9, "circle-color": "#1f6feb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } }
    ];
    return {
      version: 8, name: "Sucre", glyphs: GLYPHS,
      sources: {
        omt: { type: "vector", url: "pmtiles://mapa", attribution: ATTR },
        sitios: { type: "geojson", data: sitiosData },
        pin: { type: "geojson", data: pinData }
      },
      layers: layers
    };
  }
  window.__buildStyle = buildStyle; // útil para depurar

  /* ---------- estado ---------- */
  var sitios = [];
  try { sitios = JSON.parse(lsGet(LS_SITIOS, "[]")) || []; } catch (e) { sitios = []; }
  var state = { sel: null, pin: null };
  var dark = lsGet(LS_TEMA, null);
  dark = dark === null ? !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) : dark === "1";
  document.body.classList.toggle("dark", dark);

  /* ---------- mapa ---------- */
  var mem = new MemorySource();
  mem.promise.catch(function (err) {
    $("loading").innerHTML = '<div style="text-align:center;padding:0 24px">No se pudo cargar el mapa.<br><small>La primera vez necesitas internet. (' + (err && err.message || err) + ')</small></div>';
  });
  var protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocol.add(new pmtiles.PMTiles(mem));

  var map = new maplibregl.Map({
    container: "map", style: buildStyle(dark, sitiosFC(sitios), pinFC(null)),
    center: CENTER, zoom: 13, minZoom: 9.5, maxZoom: 19.5, maxBounds: BOUNDS,
    attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false, touchPitch: false
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true
  }), "bottom-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

  var hidden = false;
  function hideLoading() { if (hidden) return; hidden = true; $("loading").classList.add("hide"); }
  map.once("load", hideLoading);
  map.once("idle", hideLoading);
  map.on("error", function (e) { if (window.console) console.warn(e && e.error || e); });

  function setPin(pt) {
    state.pin = pt;
    var s = map.getSource("pin");
    if (s) s.setData(pinFC(pt));
  }
  function refreshSitios() {
    lsSet(LS_SITIOS, JSON.stringify(sitios));
    var s = map.getSource("sitios");
    if (s) s.setData(sitiosFC(sitios));
  }

  /* ---------- tema ---------- */
  $("btnTema").addEventListener("click", function () {
    dark = !dark;
    lsSet(LS_TEMA, dark ? "1" : "0");
    document.body.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? "#14181d" : "#1f6feb");
    map.setStyle(buildStyle(dark, sitiosFC(sitios), pinFC(state.pin)), { diff: false });
  });

  /* ---------- hoja del lugar seleccionado ---------- */
  var TIPO = {
    restaurant: "Restaurante", fast_food: "Comida rápida", cafe: "Café", bar: "Bar", bakery: "Panadería", lodging: "Alojamiento", hotel: "Hotel",
    shop: "Tienda", grocery: "Abarrotes", supermarket: "Supermercado", bank: "Banco", atm: "Cajero", hospital: "Hospital", pharmacy: "Farmacia",
    doctors: "Médico", dentist: "Dentista", clinic: "Clínica", school: "Colegio", college: "Universidad", university: "Universidad", library: "Biblioteca",
    place_of_worship: "Iglesia / templo", park: "Parque", museum: "Museo", fuel: "Gasolinera", police: "Policía", city: "Ciudad", village: "Comunidad", hamlet: "Caserío"
  };
  function findSaved(sel) {
    for (var i = 0; i < sitios.length; i++) {
      if (Math.abs(sitios[i].lon - sel.lon) < 6e-5 && Math.abs(sitios[i].lat - sel.lat) < 6e-5) return sitios[i];
    }
    return null;
  }
  function openSheet(sel) {
    state.sel = sel;
    closePanel();
    $("sheetTitle").textContent = sel.name || "Punto seleccionado";
    $("sheetSub").textContent = (sel.tipo ? sel.tipo + " · " : "") + sel.lat.toFixed(5) + ", " + sel.lon.toFixed(5);
    var saved = findSaved(sel), b = $("btnGuardar");
    b.textContent = saved ? "Quitar de mis sitios" : "Guardar sitio";
    b.className = "btn " + (saved ? "danger" : "primary");
    $("sheet").classList.add("open");
  }
  function closeSheet() { $("sheet").classList.remove("open"); setPin(null); state.sel = null; }
  $("sheetClose").addEventListener("click", closeSheet);

  $("btnGuardar").addEventListener("click", function () {
    var sel = state.sel; if (!sel) return;
    var saved = findSaved(sel);
    if (saved) {
      sitios = sitios.filter(function (s) { return s !== saved; });
      refreshSitios(); toast("Sitio quitado"); openSheet(sel); return;
    }
    var name = window.prompt("Nombre del sitio:", sel.name || "");
    if (name === null) return;
    name = name.trim() || sel.name || "Sitio";
    sitios.push({ id: Date.now().toString(36), name: name, lon: sel.lon, lat: sel.lat, tipo: sel.tipo || "" });
    sel.name = name;
    refreshSitios(); toast("Sitio guardado"); openSheet(sel);
  });
  $("btnCopiar").addEventListener("click", function () {
    var sel = state.sel; if (!sel) return;
    var txt = sel.lat.toFixed(6) + ", " + sel.lon.toFixed(6);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast("Coordenadas copiadas"); }, function () { window.prompt("Copia las coordenadas:", txt); });
    } else { window.prompt("Copia las coordenadas:", txt); }
  });
  $("btnMaps").addEventListener("click", function () {
    var sel = state.sel; if (!sel) return;
    window.open("https://www.google.com/maps/search/?api=1&query=" + sel.lat + "," + sel.lon, "_blank", "noopener");
  });

  var QLAYERS = ["sitios-dot", "poi-dot", "poi-label", "place-city", "place-village", "place-hamlet", "peak-label"];
  map.on("click", function (e) {
    hideResults();
    var r = 10, box = [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]];
    var fs = map.queryRenderedFeatures(box, { layers: QLAYERS });
    var sel;
    if (fs.length) {
      var f = fs[0], p = f.properties || {}, co = f.geometry && f.geometry.type === "Point" ? f.geometry.coordinates : [e.lngLat.lng, e.lngLat.lat];
      sel = { name: p.name || p["name:latin"] || "", tipo: f.layer.id === "sitios-dot" ? "Mi sitio" : (TIPO[p.class] || (p.class ? String(p.class).replace(/_/g, " ") : "")), lon: co[0], lat: co[1] };
    } else {
      sel = { name: "", tipo: "", lon: e.lngLat.lng, lat: e.lngLat.lat };
    }
    setPin([sel.lon, sel.lat]);
    openSheet(sel);
  });
  map.on("mousemove", function (e) {
    var fs = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: QLAYERS });
    map.getCanvas().style.cursor = fs.length ? "pointer" : "";
  });

  /* ---------- mis sitios ---------- */
  function closePanel() { $("panelSitios").classList.remove("open"); }
  function renderSitios() {
    var ul = $("listaSitios"); ul.innerHTML = "";
    if (!sitios.length) {
      var li = document.createElement("li"); li.className = "vacio"; li.style.display = "block";
      li.textContent = "Aún no tienes sitios guardados. Toca un punto del mapa y usa “Guardar sitio”.";
      ul.appendChild(li); return;
    }
    sitios.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "es"); }).forEach(function (s) {
      var li = document.createElement("li");
      var info = document.createElement("div"); info.className = "info";
      var b = document.createElement("b"); b.textContent = s.name;
      var sp = document.createElement("span"); sp.textContent = s.lat.toFixed(5) + ", " + s.lon.toFixed(5);
      info.appendChild(b); info.appendChild(sp);
      info.addEventListener("click", function () {
        closePanel();
        map.flyTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 16), essential: true });
        setPin([s.lon, s.lat]);
        openSheet({ name: s.name, tipo: "Mi sitio", lon: s.lon, lat: s.lat });
      });
      var del = document.createElement("button"); del.className = "del"; del.setAttribute("aria-label", "Eliminar"); del.textContent = "🗑";
      del.addEventListener("click", function () {
        if (!window.confirm("¿Eliminar “" + s.name + "”?")) return;
        sitios = sitios.filter(function (x) { return x.id !== s.id; });
        refreshSitios(); renderSitios();
      });
      li.appendChild(info); li.appendChild(del); ul.appendChild(li);
    });
  }
  $("btnSitios").addEventListener("click", function () {
    if ($("panelSitios").classList.contains("open")) { closePanel(); return; }
    $("sheet").classList.remove("open"); renderSitios(); $("panelSitios").classList.add("open");
  });
  $("panelClose").addEventListener("click", closePanel);

  $("btnExportar").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(sitios, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mis-sitios-sucre.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  });
  $("btnImportar").addEventListener("click", function () { $("fileImport").click(); });
  $("fileImport").addEventListener("change", function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var arr = JSON.parse(rd.result), added = 0;
        if (!Array.isArray(arr)) throw new Error("formato");
        arr.forEach(function (s) {
          if (s && typeof s.name === "string" && isFinite(s.lon) && isFinite(s.lat) && !sitios.some(function (x) { return x.id === s.id; })) {
            sitios.push({ id: s.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: s.name, lon: +s.lon, lat: +s.lat, tipo: s.tipo || "" }); added++;
          }
        });
        refreshSitios(); renderSitios(); toast(added + " sitio(s) importado(s)");
      } catch (e) { toast("Archivo no válido"); }
      ev.target.value = "";
    };
    rd.readAsText(f);
  });

  /* ---------- búsqueda (100% offline) ---------- */
  var INDEX = [];
  fetch(BASE + "data/search.json").then(function (r) { return r.json(); }).then(function (arr) {
    INDEX = arr.map(function (e) { return { n: e[0], t: e[1], lon: e[2], lat: e[3], w: e[4], k: norm(e[0]) }; });
  }).catch(function () { /* sin índice: la búsqueda queda vacía */ });

  var q = $("q"), results = $("results");
  function hideResults() { results.style.display = "none"; }
  function search(text) {
    var toks = norm(text).split(/\s+/).filter(Boolean);
    if (!toks.length) return null;
    var out = [];
    for (var i = 0; i < INDEX.length; i++) {
      var e = INDEX[i], ok = true;
      for (var j = 0; j < toks.length; j++) { if (e.k.indexOf(toks[j]) === -1) { ok = false; break; } }
      if (!ok) continue;
      var pos = e.k.indexOf(toks[0]);
      var rank = (pos === 0 ? 0 : e.k.indexOf(" " + toks[0]) > -1 ? 1 : 2) * 10 + e.w + e.k.length / 1000;
      out.push({ e: e, r: rank });
    }
    out.sort(function (a, b) { return a.r - b.r; });
    return out.slice(0, 8).map(function (x) { return x.e; });
  }
  function showResults(list) {
    results.innerHTML = "";
    if (list === null) { hideResults(); return; }
    if (!list.length) {
      var li = document.createElement("li"); li.className = "empty"; li.textContent = INDEX.length ? "Sin resultados" : "Cargando búsqueda…";
      results.appendChild(li);
    }
    list.forEach(function (e) {
      var li = document.createElement("li");
      var n = document.createElement("div"); n.className = "n"; n.textContent = e.n;
      var t = document.createElement("div"); t.className = "t"; t.textContent = e.t;
      li.appendChild(n); li.appendChild(t);
      li.addEventListener("click", function () { goTo(e); });
      results.appendChild(li);
    });
    results.style.display = "block";
  }
  function goTo(e) {
    q.value = e.n; $("btnClear").style.display = "block"; q.blur(); hideResults();
    map.flyTo({ center: [e.lon, e.lat], zoom: e.w === 1 ? 14 : 16.5, essential: true });
    setPin([e.lon, e.lat]);
    openSheet({ name: e.n, tipo: e.t, lon: e.lon, lat: e.lat });
  }
  q.addEventListener("input", function () {
    $("btnClear").style.display = q.value ? "block" : "none";
    showResults(search(q.value));
  });
  q.addEventListener("focus", function () { if (q.value) showResults(search(q.value)); });
  q.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { var l = search(q.value); if (l && l.length) goTo(l[0]); }
  });
  $("btnClear").addEventListener("click", function () { q.value = ""; $("btnClear").style.display = "none"; hideResults(); q.focus(); });
  document.addEventListener("click", function (ev) { if (!$("topbar").contains(ev.target)) hideResults(); });

  /* ---------- offline: service worker ---------- */
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
