// Zips chrome-extension/dist/ into chrome-extension/aerosub-clipper.zip —
// the file to hand teammates for "Load unpacked" (no Chrome Web Store, no
// dev-mode zip-then-unzip guesswork on their end beyond unzip + load).
//   node chrome-extension/zip.mjs
import { ZipArchive } from "archiver";
import { createWriteStream, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const distDir = dir + "dist";
const outFile = dir + "aerosub-clipper.zip";

if (!existsSync(distDir + "/manifest.json")) {
  console.error(`No build found at ${distDir} — run the build first (see package.json "ext:build*" scripts).`);
  process.exit(1);
}

const output = createWriteStream(outFile);
const archive = new ZipArchive({ zlib: { level: 9 } });

output.on("close", () => {
  console.log(`\nWrote ${outFile} (${(archive.pointer() / 1024).toFixed(1)} KB)`);
  console.log("Share this file. Teammates: unzip it, chrome://extensions -> Developer mode -> Load unpacked -> select the unzipped folder.\n");
});
archive.on("error", (err) => { throw err; });

archive.pipe(output);
archive.directory(distDir, false); // manifest.json at the zip root, as Chrome expects
archive.finalize();
