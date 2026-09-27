// Browse page: list/map toggle. The map is Google Maps when the page was
// rendered with a browser key, otherwise Leaflet + OpenStreetMap. Pins come
// from /api/listings/map with the page's own filters, and use the public
// (usually approximate) coordinates.
(function () {
  var cfg = window.FRONTAGE_MAP || {};
  var btn = document.getElementById("map-toggle-btn");
  var mapEl = document.getElementById(cfg.target || "browse-map");
  var resultsEl = document.getElementById("browse-results");
  if (!btn || !mapEl || !resultsEl) return;
  var map = null;
  var loading = false;
  // Where to centre an empty map for each market: [lat, lng, zoom].
  var CENTRES = { AU: [-25.3, 133.8, 4], AT: [47.5, 14.5, 7], BE: [50.6, 4.6, 8], BR: [-14.2, -51.9, 4], CA: [56.1, -106.3, 3], DK: [56, 10, 6], FI: [64.5, 26, 5], FR: [46.6, 2.4, 5], DE: [51.2, 10.4, 6], HK: [22.35, 114.15, 10], IN: [22, 79, 4], IE: [53.4, -8, 6], IT: [42.8, 12.5, 5], JP: [36.2, 138.3, 5], MX: [23.6, -102.5, 5], NL: [52.2, 5.3, 7], NZ: [-41, 174, 5], NO: [64.5, 11, 4], PL: [52, 19, 6], PT: [39.6, -8, 6], SG: [1.35, 103.82, 11], ZA: [-29, 24, 5], KR: [36.3, 127.8, 7], ES: [40.2, -3.7, 6], SE: [62, 15, 4], CH: [46.8, 8.2, 7], TW: [23.7, 121, 7], AE: [24.3, 54.3, 7], GB: [54, -2.5, 5], US: [39.8, -98.6, 4] };
  var centre = CENTRES[cfg.country] || [20, 0, 2];

  function popupContent(l) {
    // Built with DOM APIs, never innerHTML — titles are seller-supplied.
    var wrap = document.createElement("a");
    wrap.href = "/listing/" + encodeURIComponent(l.id);
    wrap.className = "map-popup";
    if (l.photo) {
      var img = document.createElement("img");
      img.src = l.photo;
      img.alt = "";
      wrap.appendChild(img);
    }
    var price = document.createElement("strong");
    price.textContent = l.price;
    var title = document.createElement("div");
    title.textContent = l.title;
    var meta = document.createElement("div");
    meta.className = "small muted";
    meta.textContent = l.category + (l.suburb ? " · " + l.suburb : "") + (l.exact ? "" : " · approx. location");
    wrap.appendChild(price);
    wrap.appendChild(title);
    wrap.appendChild(meta);
    return wrap;
  }

  function fetchListings() {
    return fetch("/api/listings/map" + (cfg.mapQuery || window.location.search), { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.listings) || []; });
  }

  function initGoogle() {
    window.frontageInitBrowseMap = function () {
      map = new google.maps.Map(mapEl, { center: { lat: centre[0], lng: centre[1] }, zoom: centre[2], mapTypeControl: false, streetViewControl: false, clickableIcons: false });
      var info = new google.maps.InfoWindow();
      fetchListings().then(function (listings) {
        var bounds = new google.maps.LatLngBounds();
        listings.forEach(function (l) {
          var marker = new google.maps.Marker({ position: { lat: l.lat, lng: l.lng }, map: map, title: l.title });
          bounds.extend(marker.getPosition());
          marker.addListener("click", function () { info.setContent(popupContent(l)); info.open(map, marker); });
        });
        if (listings.length === 1) { map.setCenter(bounds.getCenter()); map.setZoom(13); }
        else if (listings.length > 1) {
          map.fitBounds(bounds, 40);
          google.maps.event.addListenerOnce(map, "idle", function () { if (map.getZoom() > 14) map.setZoom(14); });
        }
      });
    };
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(cfg.key) + "&callback=frontageInitBrowseMap&loading=async&v=weekly";
    document.head.appendChild(s);
  }

  function initLeaflet() {
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    var s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = function () {
      map = L.map(mapEl).setView([centre[0], centre[1]], centre[2]);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      fetchListings().then(function (listings) {
        var pts = [];
        listings.forEach(function (l) {
          L.marker([l.lat, l.lng]).addTo(map).bindPopup(popupContent(l));
          pts.push([l.lat, l.lng]);
        });
        if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
      });
    };
    document.body.appendChild(s);
  }

  // Keep ?view=map in the URL and in the chip/filter links, so changing
  // category keeps you on the map.
  function rememberView(isMap) {
    if (!window.history || !history.replaceState) return;
    var url = new URL(window.location.href);
    if (isMap) url.searchParams.set("view", "map");
    else url.searchParams.delete("view");
    history.replaceState({}, "", url.toString());
    document.querySelectorAll("#category-chips a[href], [data-filter-link]").forEach(function (a) {
      var href = new URL(a.getAttribute("href"), window.location.href);
      if (isMap) href.searchParams.set("view", "map");
      else href.searchParams.delete("view");
      a.setAttribute("href", href.pathname + href.search);
    });
    var filterForm = document.querySelector(".filters-menu");
    if (filterForm) {
      var hidden = filterForm.querySelector('input[name="view"]');
      if (isMap && !hidden) {
        hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.name = "view";
        hidden.value = "map";
        filterForm.appendChild(hidden);
      } else if (!isMap && hidden) hidden.remove();
    }
  }

  function showMap() {
    mapEl.hidden = false;
    resultsEl.hidden = true;
    btn.textContent = "List view";
    rememberView(true);
    if (!map && !loading) {
      loading = true;
      if (cfg.engine === "google" && cfg.key) initGoogle();
      else initLeaflet();
    } else if (map && map.invalidateSize) setTimeout(function () { map.invalidateSize(); }, 50);
  }
  function showList() {
    mapEl.hidden = true;
    resultsEl.hidden = false;
    btn.textContent = "Map view";
    rememberView(false);
  }
  btn.addEventListener("click", function () { mapEl.hidden ? showMap() : showList(); });
  if (cfg.startInMap) showMap();
})();
