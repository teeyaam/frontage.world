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
    return fetch("/api/listings/map" + window.location.search, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.listings) || []; });
  }

  function initGoogle() {
    window.frontageInitBrowseMap = function () {
      map = new google.maps.Map(mapEl, { center: { lat: -33.8688, lng: 151.2093 }, zoom: 10, mapTypeControl: false, streetViewControl: false, clickableIcons: false });
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
      map = L.map(mapEl).setView([-33.8688, 151.2093], 10);
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
