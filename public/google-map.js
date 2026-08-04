// Renders pinned listings using the Google Maps JavaScript API — the paid
// alternative to public/map.js's free Leaflet/OpenStreetMap map. Loaded
// only when GOOGLE_MAPS_API_KEY is set (see routes/pages.js#browsePage);
// otherwise the Leaflet version is used instead, so nothing breaks either
// way. Google's own script tag calls window.frontageInitGoogleMap once its
// library has loaded (the `callback=` param in that script's URL).
window.frontageInitGoogleMap = function () {
  var targetId = window.FRONTAGE_MAP_TARGET || "map";
  var mapEl = document.getElementById(targetId);
  if (!mapEl || typeof google === "undefined") return;

  var map = new google.maps.Map(mapEl, {
    center: { lat: -33.8688, lng: 151.2093 }, // Sydney CBD default
    zoom: 11,
  });
  window.__frontageMap = map;
  var infoWindow = new google.maps.InfoWindow();

  fetch("/api/listings/map")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var listings = (data && data.listings) || [];
      var bounds = new google.maps.LatLngBounds();
      var any = false;

      listings.forEach(function (l) {
        if (typeof l.lat !== "number" || typeof l.lng !== "number") return;
        any = true;
        var position = { lat: l.lat, lng: l.lng };
        var marker = new google.maps.Marker({ position: position, map: map, title: l.title });
        bounds.extend(position);

        // Built with DOM APIs (not innerHTML) so listing titles/suburbs
        // (seller-supplied text) can never inject markup into the popup.
        var content = document.createElement("div");
        var titleLink = document.createElement("a");
        titleLink.href = "/listing/" + encodeURIComponent(l.id);
        titleLink.textContent = l.title;
        titleLink.style.fontWeight = "700";
        titleLink.style.color = "#1B2A3D";
        var priceDiv = document.createElement("div");
        priceDiv.textContent =
          "$" + Number(l.price).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "/mo · " + l.suburb;
        priceDiv.style.fontSize = "12px";
        priceDiv.style.marginTop = "2px";
        content.appendChild(titleLink);
        content.appendChild(priceDiv);
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
          content.appendChild(gLink);
        }

        marker.addListener("click", function () {
          infoWindow.setContent(content);
          infoWindow.open(map, marker);
        });
      });

      if (any) {
        map.fitBounds(bounds, 30);
        google.maps.event.addListenerOnce(map, "bounds_changed", function () {
          if (map.getZoom() > 14) map.setZoom(14);
        });
      }
    })
    .catch(function () {});
};
