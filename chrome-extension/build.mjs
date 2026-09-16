// Builds the extension into chrome-extension/dist/ — an IIFE popup.js with
// @supabase/supabase-js inlined, the public config baked in from the repo
// .env, and a manifest whose host_permissions point at that Supabase origin.
//   node chrome-extension/build.mjs
import { build } from "vite";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("..", import.meta.url));

const env = {};
for (const line of readFileSync(root + "/.env", "utf8").split("\n")) {
  const m = line.match(/^\s*(VITE_[A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2];
}
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const OUT = dir + "dist";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  root: dir,
  configFile: false,
  define: {
    "process.env.SUPABASE_URL": JSON.stringify(url),
    "process.env.SUPABASE_ANON_KEY": JSON.stringify(anon),
  },
  build: {
    outDir: OUT,
    emptyOutDir: false,
    target: "chrome111",
    lib: { entry: dir + "popup.js", formats: ["iife"], name: "AerosubPopup", fileName: () => "popup.js" },
  },
  logLevel: "warn",
});

const manifest = JSON.parse(readFileSync(dir + "manifest.json", "utf8"));
manifest.host_permissions = [new URL(url).origin + "/*"];
manifest.content_security_policy = { extension_pages: "script-src 'self'; object-src 'self'" };
writeFileSync(OUT + "/manifest.json", JSON.stringify(manifest, null, 2));

for (const f of ["popup.html", "icon16.png", "icon32.png", "icon48.png", "icon128.png"]) {
  copyFileSync(dir + f, OUT + "/" + f);
}

console.log(`\nBuilt chrome-extension/dist/  —  Load unpacked that folder in chrome://extensions`);
console.log(`Supabase origin allowed: ${new URL(url).origin}\n`);
