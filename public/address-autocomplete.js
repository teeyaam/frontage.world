// Google Places Autocomplete for the listing address field — loaded only
// when GOOGLE_MAPS_API_KEY is configured (see routes/pages.js
// addressFieldsMarkup). Typing into #frontage-address-input shows Google's
// live address suggestions; picking one fills the address, suburb,
// postcode, country, and hidden lat/lng fields automatically, so the
// listing gets a precise pin instead of the free-tier suburb-centroid
// fallback in lib/geo.js. Google calls this once its script has loaded (the
// `callback=` param on that script's URL).
window.frontageInitAddressAutocomplete = function () {
  var input = document.getElementById("frontage-address-input");
  if (!input || typeof google === "undefined" || !google.maps.places) return;

  var suburbEl = document.getElementById("frontage-suburb-input");
  var postcodeEl = document.getElementById("frontage-postcode-input");
  var countryEl = document.getElementById("frontage-country-input");
  var latEl = document.getElementById("frontage-lat-input");
  var lngEl = document.getElementById("frontage-lng-input");
  var toggleBtn = document.getElementById("address-manual-toggle");
  var hintEl = document.getElementById("address-autocomplete-hint");

  var autocomplete = new google.maps.places.Autocomplete(input, {
    fields: ["address_components", "formatted_address", "geometry"],
  });

  function componentValue(components, type) {
    var match = (components || []).filter(function (c) {
      return c.types.indexOf(type) !== -1;
    })[0];
    return match ? match.long_name : "";
  }

  autocomplete.addListener("place_changed", function () {
    var place = autocomplete.getPlace();
    if (!place || !place.geometry) {
      if (hintEl) {
        hintEl.textContent = "Couldn't find that address on Google Maps — use \"Enter it manually\" below.";
        hintEl.style.color = "var(--red)";
      }
      return;
    }
    input.value = place.formatted_address || input.value;
    var comps = place.address_components;
    var suburb = componentValue(comps, "locality") || componentValue(comps, "postal_town") || componentValue(comps, "sublocality");
    if (suburb && suburbEl) suburbEl.value = suburb;
    var postcode = componentValue(comps, "postal_code");
    if (postcode && postcodeEl) postcodeEl.value = postcode;
    var country = componentValue(comps, "country");
    if (country && countryEl) countryEl.value = country;
    if (latEl) latEl.value = place.geometry.location.lat();
    if (lngEl) lngEl.value = place.geometry.location.lng();
    if (hintEl) {
      hintEl.textContent = "✓ Address matched on Google Maps.";
      hintEl.style.color = "var(--green)";
    }
  });

  // "Can't find your address?" — turns off the constrained Places lookup so
  // the field becomes a plain free-text input. There's no separate "manual
  // mode" in the Places API; this just stops listening for place selections,
  // hides the suggestion dropdown, and clears any lat/lng a prior (wrong)
  // selection may have set, so the server falls back to geocoding from the
  // typed suburb instead (see lib/geo.js).
  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      google.maps.event.clearInstanceListeners(input);
      var pacContainers = document.querySelectorAll(".pac-container");
      pacContainers.forEach(function (el) {
        el.style.display = "none";
      });
      input.placeholder = "14 Wattle St, Castle Hill NSW";
      if (latEl) latEl.value = "";
      if (lngEl) lngEl.value = "";
      toggleBtn.style.display = "none";
      if (hintEl) {
        hintEl.textContent = "Manual entry — type your full address. We'll estimate the map location from your suburb.";
        hintEl.style.color = "";
      }
    });
  }
};
