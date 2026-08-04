// Renders pinned listings using Leaflet + OpenStreetMap tiles — no API key
// or billing account needed, unlike Google Maps. Targets the element id in
// window.FRONTAGE_MAP_TARGET if set (used when embedded inline on the
// browse page), falling back to "map" (the standalone /map page).
(function () {
  var targetId = window.FRONTAGE_MAP_TARGET || "map";
  var mapEl = document.getElementById(targetId);
  if (!mapEl || typeof L === "undefined") return;

  var map = L.map(mapEl).setView([-33.8688, 151.2093], 11); // Sydney CBD default
  window.__frontageMap = map;

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  fetch("/api/listings/map")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var listings = (data && data.listings) || [];
      var bounds = [];
      listings.forEach(function (l) {
        if (typeof l.lat !== "number" || typeof l.lng !== "number") return;
        var marker = L.marker([l.lat, l.lng]).addTo(map);
        var priceText = "$" + Number(l.price).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "/mo";
        var popupDiv = document.createElement("div");
        var titleLink = document.createElement("a");
        titleLink.href = "/listing/" + encodeURIComponent(l.id);
        titleLink.textContent = l.title;
        titleLink.style.fontWeight = "700";
        var priceDiv = document.createElement("div");
        priceDiv.textContent = priceText + " · " + l.suburb;
        priceDiv.style.fontSize = "12px";
        priceDiv.style.marginTop = "2px";
        popupDiv.appendChild(titleLink);
        popupDiv.appendChild(priceDiv);
        if (l.googleBusinessUrl) {
          var gLink = document.createElement("a");
          gLink.href = l.googleBusinessUrl;
          gLink.target = "_blank";
          gLink.rel = "noopener";
          gLink.textContent = "View on Google →";
          gLink.style.fontSize = "12px";
          gLink.style.display = "block";
          gLink.style.marginTop = "4px";
          gLink.style.color = "#2F5D9F";
          popupDiv.appendChild(gLink);
        }
        marker.bindPopup(popupDiv);
        bounds.push([l.lat, l.lng]);
      });
      if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    })
    .catch(function () {});
})();
