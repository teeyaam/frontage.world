// Reads an application/x-www-form-urlencoded (or JSON) request body with no
// external body-parser dependency. Capped at `limit` bytes so a huge POST
// can't exhaust memory; oversized bodies reject with err.code = "BODY_TOO_LARGE".
export function readBody(req, { limit = 64 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on("data", (c) => {
      if (failed) return;
      size += c.length;
      if (size > limit) {
        failed = true;
        const err = new Error("Request body too large");
        err.code = "BODY_TOO_LARGE";
        req.resume();
        return reject(err);
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (failed) return;
      const raw = Buffer.concat(chunks).toString("utf8");
      const contentType = req.headers["content-type"] || "";
      try {
        if (contentType.includes("application/json")) {
          resolve(raw ? JSON.parse(raw) : {});
        } else {
          const params = new URLSearchParams(raw);
          const obj = {};
          for (const [k, v] of params.entries()) obj[k] = v;
          resolve(obj);
        }
      } catch (err) {
        err.code = "BAD_BODY";
        reject(err);
      }
    });
    req.on("error", reject);
  });
}
