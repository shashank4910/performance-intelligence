import fs from "fs";
import path from "path";

function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory() && f !== "node_modules" && f !== ".next") walk(p);
    else if (f.endsWith(".tsx")) {
      let c = fs.readFileSync(p, "utf8");
      if (!c.includes("apm-btn-primary")) continue;
      const o = c;
      // Remove text-white from apm-btn-primary button classNames (lime uses dark text in CSS)
      c = c.replace(
        /apm-btn-primary([^"]*?)\btext-white\b/g,
        "apm-btn-primary$1"
      );
      c = c.replace(
        /\btext-white\b([^"]*?)apm-btn-primary/g,
        "$1apm-btn-primary"
      );
      if (c !== o) fs.writeFileSync(p, c);
    }
  }
}

walk("app");
walk("components");
console.log("ok");
