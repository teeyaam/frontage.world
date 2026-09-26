// Small progressive enhancements only — every page and form in this app
// works with this file absent (plain HTML forms, full-page reloads).
document.addEventListener("DOMContentLoaded", function () {
  // Auto-dismiss the top flash banner after a few seconds, if present.
  var flash = document.querySelector(".flash");
  if (flash) {
    setTimeout(function () {
      flash.style.transition = "opacity .4s";
      flash.style.opacity = "0";
    }, 4000);
  }

  // Chat: simple polling refresh (no websockets) — every chat-thread element
  // fetches its JSON endpoint every few seconds and re-renders bubbles via
  // DOM APIs (textContent, never innerHTML) so message bodies can't inject markup.
  document.querySelectorAll(".chat-thread[data-poll-url]").forEach(function (el) {
    var url = el.getAttribute("data-poll-url");
    var currentUserId = el.getAttribute("data-current-user");
    function render(messages) {
      el.textContent = "";
      if (!messages.length) {
        var empty = document.createElement("div");
        empty.className = "small muted";
        empty.textContent = "No messages yet.";
        el.appendChild(empty);
        return;
      }
      messages.forEach(function (m) {
        var bubble = document.createElement("div");
        bubble.className = "chat-bubble" + (m.senderId === currentUserId ? " mine" : "");
        var name = document.createElement("div");
        name.className = "small";
        name.style.fontWeight = "600";
        name.style.marginBottom = "2px";
        name.textContent = (m.senderName || "").split(" ")[0];
        var body = document.createElement("div");
        body.textContent = m.body;
        bubble.appendChild(name);
        bubble.appendChild(body);
        el.appendChild(bubble);
      });
      el.scrollTop = el.scrollHeight;
    }
    function poll() {
      fetch(url, { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) { if (data && data.messages) render(data.messages); })
        .catch(function () {});
    }
    setInterval(poll, 4000);
  });
});
