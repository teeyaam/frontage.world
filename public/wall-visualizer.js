// Camera + gyroscope wall-sizing aid for the "List your space" form.
//
// This is deliberately NOT real AR measurement — a plain browser page has no
// access to ARKit/ARCore-grade depth sensing. What it does instead: shows a
// live camera preview with a rectangle overlaid at the seller's entered
// width:height ratio (sized by a manual slider, no real-world scale), plus a
// device-tilt readout so the seller can judge whether they're holding the
// phone level. It never blocks listing creation if the camera or the
// orientation sensor is unavailable or the user declines the permission.
(function () {
  var btn = document.getElementById("ar-preview-btn");
  if (!btn) return;

  var overlay = null;
  var stream = null;
  var orientationHandler = null;

  function closeOverlay() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    if (orientationHandler) {
      window.removeEventListener("deviceorientation", orientationHandler);
      orientationHandler = null;
    }
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  function showMessage(text) {
    var msg = document.createElement("div");
    msg.className = "small muted";
    msg.style.marginTop = "-8px";
    msg.style.marginBottom = "14px";
    msg.textContent = text;
    btn.insertAdjacentElement("afterend", msg);
    setTimeout(function () { msg.remove(); }, 6000);
  }

  btn.addEventListener("click", function () {
    var sizeW = parseFloat((document.getElementById("sizeW") || {}).value);
    var sizeH = parseFloat((document.getElementById("sizeH") || {}).value);
    if (!sizeW || !sizeH) {
      showMessage("Enter a width and height first so the preview can match your space's proportions.");
      return;
    }
    // Browsers only expose camera/orientation APIs in a "secure context"
    // (HTTPS, or localhost). On a phone visiting the dev server over a plain
    // http://<lan-ip> URL, navigator.mediaDevices is simply undefined — not
    // a permissions issue, and not something the app can work around. This
    // resolves itself once the app is deployed behind HTTPS.
    if (window.isSecureContext === false) {
      showMessage("Camera preview needs a secure (HTTPS) connection — it isn't available over a plain http:// address like this dev server on your phone. It'll work once Frontage is deployed with HTTPS. The size fields above still work fine.");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showMessage("Camera preview isn't supported in this browser — the size fields above still work fine.");
      return;
    }

    overlay = document.createElement("div");
    overlay.className = "ar-overlay";
    overlay.innerHTML =
      '<video class="ar-video" autoplay playsinline muted></video>' +
      '<div class="ar-rect"></div>' +
      '<div class="ar-tilt-badge">Tilt: —</div>' +
      '<div class="ar-controls">' +
      '<input type="range" min="20" max="95" value="55" id="ar-scale-slider" />' +
      '<button type="button" class="btn btn-outline btn-sm ar-close">Close preview</button>' +
      "</div>";
    document.body.appendChild(overlay);

    var video = overlay.querySelector(".ar-video");
    var rect = overlay.querySelector(".ar-rect");
    var slider = overlay.querySelector("#ar-scale-slider");
    var tiltBadge = overlay.querySelector(".ar-tilt-badge");
    var closeBtn = overlay.querySelector(".ar-close");

    var ratio = sizeW / sizeH;
    function applyScale() {
      var pct = Number(slider.value);
      var vw = window.innerWidth * (pct / 100);
      var vh = vw / ratio;
      rect.style.width = vw + "px";
      rect.style.height = vh + "px";
    }
    slider.addEventListener("input", applyScale);
    applyScale();

    closeBtn.addEventListener("click", closeOverlay);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(function (s) {
        stream = s;
        video.srcObject = s;
      })
      .catch(function () {
        showMessage("Camera permission wasn't granted — you can still size the panel visually with the ratio box.");
      });

    function startOrientation() {
      orientationHandler = function (event) {
        if (event.beta === null || event.gamma === null) {
          tiltBadge.textContent = "Tilt: unavailable on this device";
          return;
        }
        var level = Math.abs(event.gamma) < 5;
        tiltBadge.textContent = "Tilt: " + Math.round(event.gamma) + "° " + (level ? "(level ✓)" : "(adjust)");
        tiltBadge.style.color = level ? "#3C6E47" : "#FF6B35";
      };
      window.addEventListener("deviceorientation", orientationHandler);
    }

    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      // iOS 13+ requires this to be called from a user gesture, which the
      // "Preview on your wall" click already is.
      DeviceOrientationEvent.requestPermission()
        .then(function (perm) {
          if (perm === "granted") startOrientation();
          else tiltBadge.textContent = "Tilt: permission declined";
        })
        .catch(function () {
          tiltBadge.textContent = "Tilt: unavailable";
        });
    } else if (typeof DeviceOrientationEvent !== "undefined") {
      startOrientation();
    } else {
      tiltBadge.textContent = "Tilt: not supported on this device";
    }
  });
})();
