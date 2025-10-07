import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_URL =
  "https://wyemh3eowg.execute-api.ap-south-1.amazonaws.com/cities";
const META_PATH = path.join(__dirname, "..", "meta-data.json");

/** Validate and normalize remote data */
const CitySchema = z.object({
  state: z.string(),
  city: z.string()
});

const ResponseSchema = z.array(CitySchema);

/** Deterministic sort & group: [{ state, cities:[...] }] */
function normalize(rows) {
  // group by state -> set of cities
  const map = new Map();
  for (const r of rows) {
    const state = r.state.trim();
    const city = r.city.trim();
    if (!map.has(state)) map.set(state, new Set());
    map.get(state).add(city);
  }
  // to array, sorted
  const states = [...map.entries()]
    .map(([state, citiesSet]) => ({
      state,
      cities: [...citiesSet].sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => a.state.localeCompare(b.state));

  return {
    lastSyncedAt: new Date().toISOString(),
    source: SOURCE_URL,
    states
  };
}

/** Read local meta */
async function readLocal() {
  try {
    const raw = await fs.readFile(META_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    // file may not exist on first run
    return { lastSyncedAt: null, source: SOURCE_URL, states: [] };
  }
}

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2);
}

async function main() {
  console.log(`Fetching: ${SOURCE_URL}`);
  const resp = await fetch(SOURCE_URL, { method: "GET" });
  if (!resp.ok) {
    console.error(`Upstream responded ${resp.status}`);
    process.exitCode = 1;
    return;
  }
  const json = await resp.json();
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error("Unexpected API shape:", parsed.error.toString());
    process.exitCode = 1;
    return;
  }

  const normalized = normalize(parsed.data);
  const local = await readLocal();

  // compare ignoring lastSyncedAt, only on structure/content
  const comparableRemote = stableStringify({
    source: normalized.source,
    states: normalized.states
  });
  const comparableLocal = stableStringify({
    source: local.source,
    states: local.states
  });

  if (comparableRemote === comparableLocal) {
    console.log("No diff detected. meta-data.json is up to date.");
    // still rewrite with updated lastSyncedAt? usually no — keep file stable to avoid noisy PRs
    return;
  }

  // Write updated file prettily
  await fs.writeFile(META_PATH, stableStringify(normalized) + "\n", "utf8");
  console.log("meta-data.json updated with latest data.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
