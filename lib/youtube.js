// Accepts any of the usual YouTube link shapes a seller might paste and
// returns just the 11-character video id (that's all the listing stores):
//   https://www.youtube.com/watch?v=ID   https://youtu.be/ID
//   https://www.youtube.com/shorts/ID    https://www.youtube.com/embed/ID
//   https://m.youtube.com/watch?v=ID&t=30s   a bare ID
// Returns null for anything else.
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (ID_RE.test(raw)) return raw;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
  let id = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

export function youTubeThumbnail(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

// youtube-nocookie: no YouTube cookies until the viewer actually plays it.
export function youTubeEmbedUrl(id) {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}

export function youTubeWatchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}
