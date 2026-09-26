// Conversation page: renders the thread, polls for new messages (every 5s
// while the tab is visible, 30s when hidden), sends without a page reload,
// and shows "Seen" under your last message once the other person has read it.
(function () {
  var thread = document.getElementById("chat-thread");
  if (!thread) return;
  var id = thread.getAttribute("data-conversation");
  var seenEl = document.getElementById("chat-seen");
  var form = document.getElementById("chat-form");
  var errEl = document.getElementById("chat-error");
  var state = window.FRONTAGE_CHAT || { messages: [], otherReadAt: null };
  var lastSignature = "";

  function fmtTime(iso) {
    var d = new Date(iso);
    var today = new Date();
    var sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  }

  // DOM APIs + textContent only: message bodies can never inject markup.
  function render(data, forceScroll) {
    var msgs = data.messages || [];
    var sig = msgs.length + ":" + (msgs.length ? msgs[msgs.length - 1].id : "") + ":" + (data.otherReadAt || "");
    if (sig === lastSignature) return;
    lastSignature = sig;
    var nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    thread.textContent = "";
    if (!msgs.length) {
      var empty = document.createElement("div");
      empty.className = "small muted chat-empty";
      empty.textContent = "No messages yet.";
      thread.appendChild(empty);
    }
    var lastDay = "";
    msgs.forEach(function (m) {
      var day = new Date(m.at).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        var sep = document.createElement("div");
        sep.className = "chat-day";
        sep.textContent = new Date(m.at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
        thread.appendChild(sep);
      }
      var bubble = document.createElement("div");
      bubble.className = "chat-bubble" + (m.mine ? " mine" : "");
      var body = document.createElement("div");
      body.className = "chat-text";
      body.textContent = m.body;
      var meta = document.createElement("div");
      meta.className = "chat-meta";
      meta.textContent = (m.mine ? "" : m.name + " · ") + fmtTime(m.at);
      bubble.appendChild(body);
      bubble.appendChild(meta);
      thread.appendChild(bubble);
    });
    // "Seen" if the other person read after my most recent message.
    var lastMine = null;
    for (var i = msgs.length - 1; i >= 0; i--) if (msgs[i].mine) { lastMine = msgs[i]; break; }
    var lastIsMine = msgs.length && msgs[msgs.length - 1].mine;
    seenEl.hidden = !(lastIsMine && lastMine && data.otherReadAt && new Date(data.otherReadAt) >= new Date(lastMine.at));
    if (forceScroll || nearBottom) thread.scrollTop = thread.scrollHeight;
  }

  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(poll, document.hidden ? 30000 : 5000);
  }
  function poll() {
    fetch("/api/conversations/" + encodeURIComponent(id) + "/messages" + (document.hidden ? "" : "?visible=1"), { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) render(d); })
      .catch(function () {})
      .then(schedule);
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); else schedule(); });

  render(state, true);
  schedule();

  // First message to a seller → analytics "lead".
  if (/[?&]started=1/.test(location.search)) {
    if (window.frontageTrack) window.frontageTrack("contact_seller", {});
    if (history.replaceState) history.replaceState(null, "", location.pathname);
  }

  if (!form) return;
  var textarea = form.querySelector("textarea");
  var button = form.querySelector("button");
  textarea.addEventListener("keydown", function (e) {
    // Enter sends, Shift+Enter adds a line (desktop). Phones keep Enter as newline.
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.submit();
    }
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = textarea.value.trim();
    if (!text || button.disabled) return;
    button.disabled = true;
    errEl.hidden = true;
    var body = new URLSearchParams();
    body.set("body", text);
    fetch(form.getAttribute("action"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      credentials: "same-origin",
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.d && res.d.error) || "Message not sent — please try again.");
        textarea.value = "";
        render(res.d, true);
      })
      .catch(function (err) {
        errEl.textContent = err.message || "Message not sent — please try again.";
        errEl.hidden = false;
      })
      .then(function () { button.disabled = false; textarea.focus(); });
  });
})();
