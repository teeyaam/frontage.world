// Listing page: photo lightbox and the click-to-load YouTube player.
(function () {
  // ---------- Lightbox ----------
  var photos = window.FRONTAGE_PHOTOS || [];
  var overlay = document.getElementById("frontage-lightbox");
  if (overlay && photos.length) {
    var img = document.getElementById("frontage-lightbox-img");
    var counter = document.getElementById("frontage-lightbox-counter");
    var idx = 0;
    var lastFocus = null;
    function render() {
      img.src = photos[idx];
      counter.textContent = idx + 1 + " / " + photos.length;
    }
    function open(i) {
      idx = i;
      render();
      lastFocus = document.activeElement;
      overlay.hidden = false;
      overlay.querySelector(".lightbox-close").focus();
    }
    function close() {
      overlay.hidden = true;
      if (lastFocus) lastFocus.focus();
    }
    function step(d) {
      idx = (idx + d + photos.length) % photos.length;
      render();
    }
    document.querySelectorAll("[data-photo]").forEach(function (b) {
      b.addEventListener("click", function () { open(parseInt(b.getAttribute("data-photo"), 10) || 0); });
    });
    overlay.addEventListener("click", function (e) {
      var action = e.target.getAttribute && e.target.getAttribute("data-lb");
      if (action === "close" || e.target === overlay) close();
      else if (action === "prev") step(-1);
      else if (action === "next") step(1);
    });
    document.addEventListener("keydown", function (e) {
      if (overlay.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });
    // Swipe on phones.
    var startX = null;
    overlay.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
      startX = null;
    });
  }

  // ---------- YouTube: thumbnail until clicked ----------
  // Nothing loads from YouTube (no cookies, no tracking) until the viewer
  // presses play; then a youtube-nocookie iframe replaces the thumbnail.
  document.querySelectorAll(".yt-facade").forEach(function (box) {
    var btn = box.querySelector(".yt-play");
    btn.addEventListener("click", function () {
      var iframe = document.createElement("iframe");
      iframe.src = box.getAttribute("data-embed");
      iframe.title = "Listing video";
      iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      box.innerHTML = "";
      box.appendChild(iframe);
    });
  });
})();
