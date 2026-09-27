// Listing form (create + edit).
//  - Photos: previews, remove, drag (or ←/→ buttons) to reorder, first is
//    the cover. Each photo is re-encoded in the browser (max 2000px JPEG),
//    which shrinks uploads and strips hidden EXIF data such as GPS.
//  - Address: Google Places (New) autocomplete when a browser key exists;
//    otherwise a plain box that the server geocodes.
//  - Submit: sent with fetch/XHR; validation errors come back as JSON and
//    show inline, so nothing typed is ever lost.
(function () {
  var form = document.getElementById("listing-form");
  if (!form) return;
  var MAX = parseInt(form.getAttribute("data-max-photos"), 10) || 10;
  var grid = document.getElementById("photo-grid");
  var input = document.getElementById("photo-input");
  var addLabel = document.getElementById("photo-add");
  var submitBtn = document.getElementById("listing-submit");
  var progress = document.getElementById("listing-progress");
  var formError = document.getElementById("form-error");

  // ---------- Photos ----------
  var photos = [];
  try {
    JSON.parse(form.getAttribute("data-existing-photos") || "[]").forEach(function (url, i) {
      photos.push({ kind: "e", idx: i, url: url });
    });
  } catch (e) {}

  function renderPhotos() {
    grid.innerHTML = "";
    photos.forEach(function (p, i) {
      var tile = document.createElement("div");
      tile.className = "photo-tile" + (p.pending ? " is-pending" : "");
      tile.draggable = true;
      tile.setAttribute("data-i", i);
      var img = document.createElement("img");
      img.src = p.url;
      img.alt = "Photo " + (i + 1);
      tile.appendChild(img);
      if (i === 0) {
        var cover = document.createElement("span");
        cover.className = "photo-cover";
        cover.textContent = "Cover";
        tile.appendChild(cover);
      }
      var tools = document.createElement("div");
      tools.className = "photo-tools";
      tools.appendChild(toolBtn("←", "Move photo " + (i + 1) + " earlier", function () { move(i, i - 1); }, i === 0));
      tools.appendChild(toolBtn("→", "Move photo " + (i + 1) + " later", function () { move(i, i + 1); }, i === photos.length - 1));
      tools.appendChild(toolBtn("✕", "Remove photo " + (i + 1), function () { remove(i); }, false));
      tile.appendChild(tools);
      tile.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/plain", String(i)); tile.classList.add("is-dragging"); });
      tile.addEventListener("dragend", function () { tile.classList.remove("is-dragging"); });
      tile.addEventListener("dragover", function (e) { e.preventDefault(); tile.classList.add("is-over"); });
      tile.addEventListener("dragleave", function () { tile.classList.remove("is-over"); });
      tile.addEventListener("drop", function (e) {
        e.preventDefault();
        tile.classList.remove("is-over");
        var from = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (!isNaN(from)) move(from, i);
      });
      grid.appendChild(tile);
    });
    addLabel.hidden = photos.length >= MAX;
  }
  function toolBtn(label, aria, fn, disabled) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    b.disabled = disabled;
    b.addEventListener("click", fn);
    return b;
  }
  function move(from, to) {
    if (to < 0 || to >= photos.length || from === to) return;
    var item = photos.splice(from, 1)[0];
    photos.splice(to, 0, item);
    renderPhotos();
  }
  function remove(i) {
    var p = photos.splice(i, 1)[0];
    if (p && p.kind === "n" && p.url.indexOf("blob:") === 0) URL.revokeObjectURL(p.url);
    renderPhotos();
  }

  // Re-encode to WebP (JPEG where the browser can't write WebP, e.g. older
  // Safari), max 1600px on the long side — sharp on any screen, and usually
  // 150–350KB instead of a 3–8MB phone photo. GIFs and anything the browser
  // can't decode (e.g. HEIC outside Safari) are uploaded as-is.
  function encode(canvas, done) {
    canvas.toBlob(function (webp) {
      if (webp && webp.type === "image/webp" && webp.size) return done(webp);
      canvas.toBlob(done, "image/jpeg", 0.82);
    }, "image/webp", 0.8);
  }
  function prepare(file) {
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type) || file.type === "image/gif") return resolve(file);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var maxSide = 1600;
        var scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * scale);
        var h = Math.round(img.naturalHeight * scale);
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        // Always the re-encoded copy, even if larger: it has no EXIF/GPS.
        encode(canvas, function (blob) { resolve(blob && blob.size ? blob : file); });
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  input.addEventListener("change", function () {
    var files = Array.prototype.slice.call(input.files || []);
    input.value = "";
    clearError("photos");
    var room = MAX - photos.length;
    if (files.length > room) showFieldError("photos", "You can add up to " + MAX + " photos — only the first " + room + " were added.");
    files.slice(0, room).forEach(function (file) {
      var item = { kind: "n", file: file, url: URL.createObjectURL(file), pending: true };
      photos.push(item);
      prepare(file).then(function (out) {
        item.file = out;
        item.pending = false;
        if (out !== file) {
          URL.revokeObjectURL(item.url);
          item.url = URL.createObjectURL(out);
        }
        renderPhotos();
      });
    });
    renderPhotos();
  });
  renderPhotos();

  // ---------- Errors ----------
  function errorEl(name) {
    return form.querySelector('[data-error-for="' + name + '"]');
  }
  function showFieldError(name, msg) {
    var el = errorEl(name);
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    var field = el.closest(".field, .form-section");
    if (field) field.classList.add("has-error");
  }
  function clearError(name) {
    var el = errorEl(name);
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
    var field = el.closest(".field, .form-section");
    if (field) field.classList.remove("has-error");
  }
  function clearAllErrors() {
    form.querySelectorAll("[data-error-for]").forEach(function (el) { clearError(el.getAttribute("data-error-for")); });
    formError.hidden = true;
  }
  ["title", "price", "priceNote", "category", "description", "address", "youtubeUrl"].forEach(function (n) {
    var el = form.elements[n];
    if (el) el.addEventListener("input", function () { clearError(n); });
  });
  ["widthM", "heightM"].forEach(function (n) {
    if (form.elements[n]) form.elements[n].addEventListener("input", function () { clearError("size"); });
  });
  function scrollToFirstError() {
    var first = form.querySelector(".has-error") || formError;
    if (first && !first.hidden) first.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------- YouTube preview ----------
  var ytInput = form.elements.youtubeUrl;
  var ytPreview = document.getElementById("yt-preview");
  function parseYouTubeId(raw) {
    raw = (raw || "").trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
    try {
      var u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
      var host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
      var id = null;
      if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
      else if (host === "youtube.com" || host === "youtube-nocookie.com") {
        if (u.pathname === "/watch") id = u.searchParams.get("v");
        else {
          var m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
          if (m) id = m[1];
        }
      }
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    } catch (e) {
      return null;
    }
  }
  function updateYt() {
    var raw = ytInput.value.trim();
    var id = raw ? parseYouTubeId(raw) : null;
    ytPreview.innerHTML = "";
    if (!raw) { ytPreview.hidden = true; return; }
    ytPreview.hidden = false;
    if (id) {
      var img = document.createElement("img");
      img.src = "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg";
      img.alt = "Video thumbnail";
      ytPreview.appendChild(img);
      var ok = document.createElement("span");
      ok.className = "small";
      ok.style.color = "var(--green)";
      ok.textContent = "✓ Video found";
      ytPreview.appendChild(ok);
    } else {
      var bad = document.createElement("span");
      bad.className = "small muted";
      bad.textContent = "Paste a YouTube link, e.g. https://youtu.be/…";
      ytPreview.appendChild(bad);
    }
  }
  if (ytInput) {
    ytInput.addEventListener("input", updateYt);
    updateYt();
  }

  // ---------- Address autocomplete (Google Places API (New)) ----------
  var places = window.FRONTAGE_PLACES || {};
  var addr = form.elements.address;
  var list = document.getElementById("address-suggestions");
  var hidden = ["placeId", "lat", "lng", "suburb", "state", "postcode", "country", "countryIso"];
  function clearPlace() { hidden.forEach(function (n) { if (form.elements[n]) form.elements[n].value = ""; }); }

  // ---------- Country → currency (automatic) ----------
  var countrySel = form.elements.countryCode;
  var currencies = {};
  try { currencies = JSON.parse(countrySel.getAttribute("data-currencies") || "{}"); } catch (e) {}
  function selectedCountry() { return countrySel ? countrySel.value : "AU"; }
  if (countrySel) {
    countrySel.addEventListener("change", function () {
      var cur = currencies[countrySel.value] || "";
      form.querySelectorAll("[data-currency-label]").forEach(function (el) { el.textContent = cur; });
      // An address picked for the old country no longer applies.
      if (addr.value) { addr.value = ""; clearPlace(); }
      clearError("countryCode");
      clearError("address");
    });
  }

  if (places.key && addr) {
    var lib = null;
    var token = null;
    var suggestions = [];
    var active = -1;
    var timer = null;
    var selectedText = addr.value;

    window.frontagePlacesInit = function () {
      google.maps.importLibrary("places").then(function (l) {
        lib = l;
        token = new lib.AutocompleteSessionToken();
      }).catch(function () {});
    };
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(places.key) + "&loading=async&v=weekly&callback=frontagePlacesInit";
    document.head.appendChild(s);

    function closeList() { list.hidden = true; list.innerHTML = ""; active = -1; addr.setAttribute("aria-expanded", "false"); }
    function renderList() {
      list.innerHTML = "";
      suggestions.forEach(function (sug, i) {
        var li = document.createElement("li");
        li.setAttribute("role", "option");
        li.id = "addr-opt-" + i;
        li.className = i === active ? "is-active" : "";
        var main = document.createElement("strong");
        main.textContent = sug.placePrediction.mainText ? sug.placePrediction.mainText.toString() : sug.placePrediction.text.toString();
        var sec = document.createElement("span");
        sec.className = "small muted";
        sec.textContent = sug.placePrediction.secondaryText ? " " + sug.placePrediction.secondaryText.toString() : "";
        li.appendChild(main);
        li.appendChild(sec);
        li.addEventListener("mousedown", function (e) { e.preventDefault(); choose(i); });
        list.appendChild(li);
      });
      list.hidden = suggestions.length === 0;
      addr.setAttribute("aria-expanded", suggestions.length ? "true" : "false");
      if (active >= 0) addr.setAttribute("aria-activedescendant", "addr-opt-" + active);
    }
    function choose(i) {
      var sug = suggestions[i];
      if (!sug) return;
      closeList();
      var place = sug.placePrediction.toPlace();
      addr.value = sug.placePrediction.text.toString();
      place.fetchFields({ fields: ["formattedAddress", "location", "addressComponents", "id"] }).then(function () {
        addr.value = place.formattedAddress || addr.value;
        selectedText = addr.value;
        form.elements.placeId.value = place.id || "";
        form.elements.lat.value = place.location ? place.location.lat() : "";
        form.elements.lng.value = place.location ? place.location.lng() : "";
        var comps = place.addressComponents || [];
        function comp(type, short) {
          for (var k = 0; k < comps.length; k++) if ((comps[k].types || []).indexOf(type) !== -1) return short ? comps[k].shortText : comps[k].longText;
          return "";
        }
        form.elements.suburb.value = comp("locality") || comp("sublocality") || comp("postal_town");
        form.elements.state.value = comp("administrative_area_level_1", true);
        form.elements.postcode.value = comp("postal_code");
        form.elements.country.value = comp("country");
        if (form.elements.countryIso) form.elements.countryIso.value = comp("country", true);
        clearError("address");
        token = new lib.AutocompleteSessionToken(); // a selection ends the billing session
      }).catch(function () {});
    }
    addr.addEventListener("input", function () {
      if (addr.value !== selectedText) clearPlace();
      clearTimeout(timer);
      var q = addr.value.trim();
      if (!lib || q.length < 3) { closeList(); return; }
      timer = setTimeout(function () {
        lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, sessionToken: token, includedRegionCodes: [selectedCountry().toLowerCase()] })
          .then(function (r) { suggestions = (r.suggestions || []).filter(function (x) { return x.placePrediction; }).slice(0, 5); active = -1; renderList(); })
          .catch(function () { closeList(); });
      }, 220);
    });
    addr.addEventListener("keydown", function (e) {
      if (list.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, suggestions.length - 1); renderList(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); renderList(); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(active); }
      else if (e.key === "Escape") closeList();
    });
    addr.addEventListener("blur", function () { setTimeout(closeList, 150); });
    addr.setAttribute("role", "combobox");
    addr.setAttribute("aria-expanded", "false");
  } else if (addr) {
    var original = addr.value;
    addr.addEventListener("input", function () { if (addr.value !== original) clearPlace(); });
  }

  // ---------- Submit ----------
  function validate() {
    var errors = {};
    if (!form.elements.title.value.trim()) errors.title = "Give your listing a title.";
    if (!form.elements.category.value) errors.category = "Choose the type of space.";
    if (!form.elements.description.value.trim()) errors.description = "Describe the space.";
    if (!form.elements.address.value.trim()) errors.address = "Enter the address of the space.";
    var price = form.elements.price.value.replace(/[$,\s]/g, "");
    if (price !== "" && !(Number(price) >= 0)) errors.price = "Enter a price in dollars, or 0 for “price on request”.";
    if (!photos.length) errors.photos = "Add at least one photo of the space.";
    if (photos.some(function (p) { return p.pending; })) errors.photos = "Photos are still being prepared — try again in a moment.";
    if (form.elements.youtubeUrl.value.trim() && !parseYouTubeId(form.elements.youtubeUrl.value)) errors.youtubeUrl = "That doesn't look like a YouTube link.";
    return errors;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearAllErrors();
    var errors = validate();
    if (Object.keys(errors).length) {
      Object.keys(errors).forEach(function (k) { showFieldError(k, errors[k]); });
      formError.textContent = "Please fix the highlighted fields.";
      formError.hidden = false;
      scrollToFirstError();
      return;
    }

    var fd = new FormData(form);
    fd.delete("photos");
    var order = [];
    var n = 0;
    photos.forEach(function (p) {
      if (p.kind === "e") order.push("e:" + p.idx);
      else {
        var ext = { "image/jpeg": ".jpg", "image/webp": ".webp", "image/png": ".png" }[p.file.type] || "";
        fd.append("photos", p.file, "photo" + ext);
        order.push("n:" + n++);
      }
    });
    fd.append("photoOrder", JSON.stringify(order));

    submitBtn.disabled = true;
    progress.textContent = n ? "Uploading photos…" : "Saving…";
    var xhr = new XMLHttpRequest();
    xhr.open("POST", form.getAttribute("action"));
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.addEventListener("progress", function (ev) {
      if (ev.lengthComputable && n) progress.textContent = "Uploading photos… " + Math.round((ev.loaded / ev.total) * 100) + "%";
    });
    xhr.onload = function () {
      var data = {};
      try { data = JSON.parse(xhr.responseText); } catch (err) {}
      if (xhr.status >= 200 && xhr.status < 300 && data.redirect) {
        progress.textContent = "Done!";
        window.location.href = data.redirect;
        return;
      }
      submitBtn.disabled = false;
      progress.textContent = "";
      var fe = data.fieldErrors || {};
      Object.keys(fe).forEach(function (k) { showFieldError(k, fe[k]); });
      formError.textContent = data.error || "Something went wrong — please try again.";
      formError.hidden = false;
      scrollToFirstError();
    };
    xhr.onerror = function () {
      submitBtn.disabled = false;
      progress.textContent = "";
      formError.textContent = "Couldn't reach Frontage — check your connection and try again. Your details are still here.";
      formError.hidden = false;
      scrollToFirstError();
    };
    xhr.send(fd);
  });

  // Warn before leaving with unsaved changes.
  var dirty = false;
  form.addEventListener("input", function () { dirty = true; });
  input.addEventListener("change", function () { dirty = true; });
  window.addEventListener("beforeunload", function (e) {
    if (dirty && !submitBtn.disabled) { e.preventDefault(); e.returnValue = ""; }
  });
})();
