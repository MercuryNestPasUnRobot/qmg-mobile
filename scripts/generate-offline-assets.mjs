import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(projectRoot, "public");
const imageExtensions = new Set([".jpeg", ".jpg", ".png", ".svg", ".webp"]);

async function collectImages(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const assets = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      assets.push(...(await collectImages(path.join(directory, entry.name), relativePath)));
    } else if (imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      assets.push(`./${relativePath}`);
    }
  }

  return assets;
}

const assets = (await collectImages(publicRoot)).sort();
await writeFile(
  path.join(publicRoot, "offline-assets.json"),
  `${JSON.stringify(assets, null, 2)}\n`,
  "utf8",
);
console.log(`Prepared ${assets.length} images for complete offline use.`);
