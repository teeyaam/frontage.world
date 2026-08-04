// Wall mockup tool for the "List your space" / "Edit listing" photo forms.
//
// Not real depth-sensing AR (a plain browser page has no ARKit/ARCore-grade
// measurement access) — instead, a practical alternative: the seller takes
// or picks a photo of the actual wall/fence, then drags four independent
// corner handles to trace exactly where the ad will sit in that photo. The
// four corners are deliberately NOT locked to a rectangle — a real wall is
// almost never square-on to the camera, and forcing perpendicularity would
// fight the entire point of a corner-pin tool. A white placeholder graphic
// (Frontage wordmark) is then warped into that quad and composited onto the
// photo, producing a real preview image that gets added to the listing's
// photos automatically.
//
// The warp is a triangle-mesh affine approximation (subdivide the source
// rectangle into an NxN grid, map each grid cell's two triangles with a
// 3-point affine transform via canvas setTransform+drawImage) — a standard
// canvas 2D technique, not a true projective homography, but visually
// convincing for a mockup at this grid density.
(function () {
  var btn = document.getElementById("ar-preview-btn");
  if (!btn) return;

  var overlay = null;

  function closeOverlay() {
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
    setTimeout(function () {
      msg.remove();
    }, 6000);
  }

  // ---------- the placeholder ad graphic (white + Frontage wordmark) ----------
  function buildAdGraphic(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    var pad = Math.min(w, h) * 0.06;
    ctx.strokeStyle = "#1B2A3D";
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.012);
    ctx.setLineDash([ctx.lineWidth * 2, ctx.lineWidth * 1.4]);
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.setLineDash([]);
    ctx.fillStyle = "#1B2A3D";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold " + Math.round(h * 0.14) + "px Arial, sans-serif";
    ctx.fillText("FRONTAGE", w / 2, h / 2 - h * 0.04);
    ctx.fillStyle = "#8B9199";
    ctx.font = Math.round(h * 0.05) + "px Arial, sans-serif";
    ctx.fillText("Free space, free money.", w / 2, h / 2 + h * 0.12);
    return c;
  }

  // ---------- triangle-affine drawImage (standard canvas warp trick) ----------
  function drawTriangle(ctx, img, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx0, dy0);
    ctx.lineTo(dx1, dy1);
    ctx.lineTo(dx2, dy2);
    ctx.closePath();
    ctx.clip();
    var denom = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
    if (Math.abs(denom) < 1e-6) {
      ctx.restore();
      return;
    }
    var a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / denom;
    var b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / denom;
    var cc = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / denom;
    var d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / denom;
    var e = (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) / denom;
    var f = (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) / denom;
    ctx.setTransform(a, b, cc, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  function bilerp(p00, p10, p11, p01, u, v) {
    var top = { x: p00.x + (p10.x - p00.x) * u, y: p00.y + (p10.y - p00.y) * u };
    var bot = { x: p01.x + (p11.x - p01.x) * u, y: p01.y + (p11.y - p01.y) * u };
    return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
  }

  // Warps `srcCanvas` into quad [tl,tr,br,bl] (each {x,y} in dest ctx space)
  // via an NxN triangle mesh, drawn onto ctx.
  function warpImageToQuad(ctx, srcCanvas, tl, tr, br, bl, grid) {
    var sw = srcCanvas.width,
      sh = srcCanvas.height;
    for (var i = 0; i < grid; i++) {
      for (var j = 0; j < grid; j++) {
        var u0 = i / grid,
          u1 = (i + 1) / grid,
          v0 = j / grid,
          v1 = (j + 1) / grid;
        var p00 = bilerp(tl, tr, br, bl, u0, v0);
        var p10 = bilerp(tl, tr, br, bl, u1, v0);
        var p11 = bilerp(tl, tr, br, bl, u1, v1);
        var p01 = bilerp(tl, tr, br, bl, u0, v1);
        var s00x = u0 * sw,
          s00y = v0 * sh,
          s10x = u1 * sw,
          s10y = v0 * sh,
          s11x = u1 * sw,
          s11y = v1 * sh,
          s01x = u0 * sw,
          s01y = v1 * sh;
        drawTriangle(ctx, srcCanvas, s00x, s00y, s10x, s10y, s11x, s11y, p00.x, p00.y, p10.x, p10.y, p11.x, p11.y);
        drawTriangle(ctx, srcCanvas, s00x, s00y, s11x, s11y, s01x, s01y, p00.x, p00.y, p11.x, p11.y, p01.x, p01.y);
      }
    }
  }

  btn.addEventListener("click", function () {
    var form = btn.closest("form");
    var fileInput = form ? form.querySelector('input[type="file"][name="photos"]') : null;
    if (!fileInput) {
      showMessage("Couldn't find the photo upload field on this form.");
      return;
    }

    var sizeWEl = document.querySelector('input[name="sizeW"]');
    var sizeHEl = document.querySelector('input[name="sizeH"]');
    var ratio = (parseFloat(sizeWEl && sizeWEl.value) || 2) / (parseFloat(sizeHEl && sizeHEl.value) || 1.2);

    overlay = document.createElement("div");
    overlay.className = "ar-overlay";
    overlay.style.flexDirection = "column";
    overlay.style.overflowY = "auto";
    overlay.style.padding = "20px 0";
    overlay.innerHTML =
      '<div style="width:100%;max-width:640px;padding:14px;box-sizing:border-box">' +
      '<div id="wm-step-pick" style="text-align:center">' +
      '<p style="color:#fff;font-size:14px;margin-bottom:14px">Take or choose a photo of the wall or fence — you\'ll drag the four corners onto it next.</p>' +
      '<input type="file" id="wm-photo-input" accept="image/*" capture="environment" style="display:block;margin:0 auto 14px;color:#fff" />' +
      '<button type="button" class="btn btn-outline btn-sm wm-cancel" style="color:#fff;border-color:#fff">Cancel</button>' +
      "</div>" +
      '<div id="wm-step-warp" style="display:none;text-align:center">' +
      '<p style="color:#fff;font-size:13px;margin-bottom:8px">Drag each corner dot to match where the ad goes on the wall.</p>' +
      '<div style="position:relative;display:inline-block;max-width:100%;touch-action:none" id="wm-canvas-wrap"></div>' +
      '<div style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-outline btn-sm wm-reset" style="color:#fff;border-color:#fff">Reset to rectangle</button>' +
      '<button type="button" class="btn btn-outline btn-sm wm-retake" style="color:#fff;border-color:#fff">Choose a different photo</button>' +
      '<button type="button" class="btn btn-primary btn-sm wm-use">Use this photo</button>' +
      '<button type="button" class="btn btn-outline btn-sm wm-cancel" style="color:#fff;border-color:#fff">Cancel</button>' +
      "</div>" +
      "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    overlay.querySelectorAll(".wm-cancel").forEach(function (b) {
      b.addEventListener("click", closeOverlay);
    });

    var pickStep = overlay.querySelector("#wm-step-pick");
    var warpStep = overlay.querySelector("#wm-step-warp");
    var photoInput = overlay.querySelector("#wm-photo-input");
    var canvasWrap = overlay.querySelector("#wm-canvas-wrap");

    photoInput.addEventListener("change", function () {
      var file = photoInput.files && photoInput.files[0];
      if (!file) return;
      var img = new Image();
      img.onload = function () {
        pickStep.style.display = "none";
        warpStep.style.display = "block";
        setupWarpEditor(img, file.type || "image/jpeg");
      };
      img.src = URL.createObjectURL(file);
    });

    function setupWarpEditor(img, mimeType) {
      var maxW = Math.min(window.innerWidth - 40, 600);
      var scale = Math.min(1, maxW / img.naturalWidth);
      var dispW = Math.round(img.naturalWidth * scale);
      var dispH = Math.round(img.naturalHeight * scale);

      var canvas = document.createElement("canvas");
      canvas.width = dispW;
      canvas.height = dispH;
      canvas.style.borderRadius = "8px";
      canvas.style.maxWidth = "100%";
      canvasWrap.innerHTML = "";
      canvasWrap.appendChild(canvas);
      var ctx = canvas.getContext("2d");

      // Corners stored as fractions (0..1) of the photo, so the same values
      // work whether drawing the small on-screen preview or the full-res
      // export.
      function defaultCorners() {
        var boxW = 0.6,
          boxH = boxW / ratio / (dispH / dispW);
        boxH = Math.min(boxH, 0.7);
        var cx = 0.5,
          cy = 0.5;
        return {
          tl: { x: cx - boxW / 2, y: cy - boxH / 2 },
          tr: { x: cx + boxW / 2, y: cy - boxH / 2 },
          br: { x: cx + boxW / 2, y: cy + boxH / 2 },
          bl: { x: cx - boxW / 2, y: cy + boxH / 2 },
        };
      }
      var corners = defaultCorners();
      var adGraphic = buildAdGraphic(600, Math.round(600 / ratio));

      function toPx(pt) {
        return { x: pt.x * dispW, y: pt.y * dispH };
      }

      function render() {
        ctx.clearRect(0, 0, dispW, dispH);
        ctx.drawImage(img, 0, 0, dispW, dispH);
        warpImageToQuad(ctx, adGraphic, toPx(corners.tl), toPx(corners.tr), toPx(corners.br), toPx(corners.bl), 10);
        ["tl", "tr", "br", "bl"].forEach(function (key) {
          var p = toPx(corners[key]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.fillStyle = "#FF6B35";
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#fff";
          ctx.stroke();
        });
      }
      render();

      // ---- drag handling (pointer events cover mouse + touch) ----
      var dragging = null;
      canvas.addEventListener("pointerdown", function (e) {
        var rect = canvas.getBoundingClientRect();
        var px = ((e.clientX - rect.left) / rect.width) * dispW;
        var py = ((e.clientY - rect.top) / rect.height) * dispH;
        var best = null,
          bestDist = 26;
        ["tl", "tr", "br", "bl"].forEach(function (key) {
          var p = toPx(corners[key]);
          var dist = Math.hypot(p.x - px, p.y - py);
          if (dist < bestDist) {
            bestDist = dist;
            best = key;
          }
        });
        if (best) {
          dragging = best;
          canvas.setPointerCapture(e.pointerId);
        }
      });
      canvas.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var rect = canvas.getBoundingClientRect();
        var fx = (e.clientX - rect.left) / rect.width;
        var fy = (e.clientY - rect.top) / rect.height;
        corners[dragging] = { x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)) };
        render();
      });
      function stopDrag() {
        dragging = null;
      }
      canvas.addEventListener("pointerup", stopDrag);
      canvas.addEventListener("pointercancel", stopDrag);

      overlay.querySelector(".wm-reset").onclick = function () {
        corners = defaultCorners();
        render();
      };
      overlay.querySelector(".wm-retake").onclick = function () {
        warpStep.style.display = "none";
        pickStep.style.display = "block";
        photoInput.value = "";
      };
      overlay.querySelector(".wm-use").onclick = function () {
        // Re-render at the photo's native resolution for the actual upload
        // (the on-screen canvas above is a scaled-down preview only).
        var full = document.createElement("canvas");
        full.width = img.naturalWidth;
        full.height = img.naturalHeight;
        var fctx = full.getContext("2d");
        fctx.drawImage(img, 0, 0);
        function toFullPx(pt) {
          return { x: pt.x * img.naturalWidth, y: pt.y * img.naturalHeight };
        }
        var fullAdGraphic = buildAdGraphic(1200, Math.round(1200 / ratio));
        warpImageToQuad(fctx, fullAdGraphic, toFullPx(corners.tl), toFullPx(corners.tr), toFullPx(corners.br), toFullPx(corners.bl), 16);

        full.toBlob(
          function (blob) {
            if (!blob) {
              showMessage("Couldn't process that photo — please try again.");
              return;
            }
            var namedFile = new File([blob], "wall-mockup-" + Date.now() + ".jpg", { type: "image/jpeg" });
            try {
              var dt = new DataTransfer();
              // Keep any photos already chosen in the field, add this one after.
              var existing = fileInput.files;
              for (var i = 0; i < existing.length; i++) dt.items.add(existing[i]);
              dt.items.add(namedFile);
              fileInput.files = dt.files;
              showMessage("Added — it'll upload along with the rest of your photos when you submit.");
            } catch (err) {
              showMessage("Your browser doesn't support attaching this automatically — save the image and upload it manually instead.");
            }
            closeOverlay();
          },
          "image/jpeg",
          0.92
        );
      };
    }
  });
})();
