// Leaflet fallback for the listing page's map, used only when no Google
// browser key is configured. Approximate locations show a ~600m circle,
// never a pin.
(function () {
  function init() {
    var d = window.FRONTAGE_SINGLE_LISTING;
    var el = document.getElementById("listing-mini-map");
    if (!d || !el || typeof L === "undefined") return;
    var map = L.map(el, { scrollWheelZoom: false }).setView([d.lat, d.lng], d.exact ? 16 : 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    if (d.exact) L.marker([d.lat, d.lng]).addTo(map);
    else L.circle([d.lat, d.lng], { radius: 600, color: "#FF6B35", fillOpacity: 0.12, weight: 1.5 }).addTo(map);
  }
  if (typeof L !== "undefined") init();
  else window.addEventListener("load", init);
})();
