import { build, context } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "src");
const OUT = resolve(__dirname, "index.html");
const watch = process.argv.includes("--watch");

const ESBUILD_OPTS = {
  entryPoints: [resolve(SRC, "js/main.js")],
  bundle: true,
  format: "iife",
  write: false,
  target: ["es2022"],
  legalComments: "none",
  sourcemap: false,
  minify: false
};

async function bundleJs() {
  const result = await build(ESBUILD_OPTS);
  return result.outputFiles[0].text;
}

async function buildOnce() {
  const tpl = readFileSync(resolve(SRC, "template.html"), "utf8");
  const css = readFileSync(resolve(SRC, "styles.css"), "utf8");
  const js = await bundleJs();
  const out = tpl
    .replace("%STYLES%", () => css)
    .replace("%SCRIPT%", () => js);
  writeFileSync(OUT, out);
  console.log(`built ${OUT} (${out.length.toLocaleString()} bytes)`);
}

if (watch) {
  const ctx = await context({
    ...ESBUILD_OPTS,
    plugins: [{
      name: "rebuild-html",
      setup(b) {
        b.onEnd(async (result) => {
          if (result.errors.length === 0) {
            try { await buildOnce(); }
            catch (e) { console.error("build failed:", e.message); }
          }
        });
      }
    }]
  });
  await ctx.watch();
  console.log(`watching ${SRC}`);
} else {
  await buildOnce();
}
