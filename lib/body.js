// Reads a application/x-www-form-urlencoded (or JSON) request body with no
// external body-parser dependency.
export function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
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
        reject(err);
      }
    });
    req.on("error", reject);
  });
}
