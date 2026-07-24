import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();
const manifestPath = join(
  root,
  "apps",
  "customer-portal",
  "app",
  "[locale]",
  "tex",
  "tex-tutorial-media.ts"
);
const publicRoot = join(root, "apps", "customer-portal", "public");
const maxBytesByExt = new Map([
  [".webm", 2 * 1024 * 1024],
  [".mp4", 2 * 1024 * 1024],
  [".webp", 350 * 1024],
  [".png", 500 * 1024],
  [".jpg", 500 * 1024],
  [".jpeg", 500 * 1024]
]);

const manifest = readFileSync(manifestPath, "utf8");
const assetMatches = [...manifest.matchAll(/\b(?:videoSrc|posterSrc|imageSrc):\s*"([^"]+)"/g)];

let failed = false;

for (const [, publicPath] of assetMatches) {
  if (!publicPath.startsWith("/tex/tutorial/")) {
    console.error(`Tutorial asset must live under /tex/tutorial/: ${publicPath}`);
    failed = true;
    continue;
  }

  const filePath = join(publicRoot, publicPath.replace(/^\//, ""));
  if (!existsSync(filePath)) {
    console.error(`Tutorial asset is missing: ${publicPath}`);
    failed = true;
    continue;
  }

  const extension = extname(filePath).toLowerCase();
  const maxBytes = maxBytesByExt.get(extension);
  if (!maxBytes) {
    console.error(`Tutorial asset uses an unsupported extension: ${publicPath}`);
    failed = true;
    continue;
  }

  const { size } = statSync(filePath);
  if (size > maxBytes) {
    console.error(`Tutorial asset is too large: ${publicPath} (${size} bytes, max ${maxBytes})`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`TEX tutorial media manifest verified (${assetMatches.length} referenced assets).`);
