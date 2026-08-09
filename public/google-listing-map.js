// Single-pin Google Maps mini-map for a listing detail page — the paid
// alternative to public/listing-map.js's free Leaflet version. Loaded only
// when GOOGLE_MAPS_API_KEY is set (see routes/pages.js#listingDetailPage);
// reads the one listing's coordinates from window.FRONTAGE_SINGLE_LISTING
// (set inline by that page) rather than fetching /api/listings/map, since
// this page only ever needs to plot one point. Google's own script tag
// calls this once its library has loaded (the `callback=` param in that
// script's URL).
window.frontageInitGoogleListingMap = function () {
  var data = window.FRONTAGE_SINGLE_LISTING;
  var mapEl = document.getElementById("listing-mini-map");
  if (!data || !mapEl || typeof google === "undefined") return;

  var position = { lat: data.lat, lng: data.lng };
  var map = new google.maps.Map(mapEl, {
    center: position,
    zoom: 14,
    scrollwheel: false,
  });
  new google.maps.Marker({ position: position, map: map, title: data.title });
};
