// /admin/examples: bulk-upload example listing photos. Each file is matched
// to its example by name (EXV-AU.jpg), shrunk in the browser, then
// uploaded on its own so a big batch never hits the request size limit.
(function () {
  var input = document.getElementById("example-photos");
  var btn = document.getElementById("example-upload-btn");
  var log = document.getElementById("example-upload-log");
  if (!input || !btn) return;

  var MAX_SIDE = 1600;

  function line(text, bad) {
    var p = document.createElement("div");
    p.textContent = text;
    if (bad) p.style.color = "#8A3A12";
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }

  function keyFor(name) {
    var m = /EXV-([A-Za-z]{2})/i.exec(name);
    return m ? "EXV-" + m[1].toUpperCase() : null;
  }

  // Resize to at most MAX_SIDE px as JPEG; fall back to the original file.
  function shrink(file) {
    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) { resolve(blob || file); }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  btn.addEventListener("click", async function () {
    var files = Array.prototype.slice.call(input.files || []);
    if (!files.length) return line("Choose some photos first.", true);
    btn.disabled = true;
    log.textContent = "";
    var done = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var key = keyFor(f.name);
      if (!key) { line(f.name + ": skipped — the name needs a code like EXV-AU", true); continue; }
      line(key + ": uploading…");
      try {
        var blob = await shrink(f);
        var fd = new FormData();
        fd.append("photos", blob, key + ".jpg");
        var res = await fetch("/api/admin/examples/" + encodeURIComponent(key) + "/photo", { method: "POST", body: fd, credentials: "same-origin" });
        var data = await res.json().catch(function () { return {}; });
        if (res.ok && data.ok) { done++; line(key + ": done ✓"); }
        else line(key + ": " + (data.error || "failed (" + res.status + ")"), true);
      } catch (err) {
        line(key + ": failed — " + err.message, true);
      }
    }
    line(done + " of " + files.length + " uploaded. Refresh to see them.");
    btn.disabled = false;
  });
})();
