// Single-pin Leaflet map for a listing detail page — reads the one listing's
// coordinates straight from window.FRONTAGE_SINGLE_LISTING (set inline by
// routes/pages.js#listingDetailPage) rather than fetching /api/listings/map,
// since this page only ever needs to plot one point.
(function () {
  var data = window.FRONTAGE_SINGLE_LISTING;
  var mapEl = document.getElementById("listing-mini-map");
  if (!data || !mapEl || typeof L === "undefined") return;

  var map = L.map(mapEl, { zoomControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false }).setView([data.lat, data.lng], 14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
  L.marker([data.lat, data.lng]).addTo(map);
})();
