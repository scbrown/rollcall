/**
 * Seed riders and crews from a JSON file: `npm run seed -- path/to/seed.json`
 * (defaults to ./seed.json). Idempotent — safe to re-run as the crew grows.
 *
 * File shape:
 *   {
 *     "crews": [
 *       { "name": "ATL Floaters", "riders": [
 *         { "phone": "+14045551234", "name": "Stiwi" }
 *       ]}
 *     ]
 *   }
 */

import { readFileSync } from "node:fs";
import { upsertCrew, upsertRider } from "./domain/riders.js";

interface SeedRider {
  phone: string;
  name: string;
}
interface SeedCrew {
  name: string;
  riders: SeedRider[];
}
interface SeedFile {
  crews: SeedCrew[];
}

const E164 = /^\+[1-9]\d{6,14}$/;

function main(): void {
  const path = process.argv[2] ?? "./seed.json";
  let parsed: SeedFile;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as SeedFile;
  } catch (err) {
    console.error(`Could not read seed file at ${path}:`, (err as Error).message);
    process.exit(1);
  }

  if (!Array.isArray(parsed.crews)) {
    console.error("Seed file must have a top-level 'crews' array.");
    process.exit(1);
  }

  let riderCount = 0;
  for (const crew of parsed.crews) {
    const crewId = upsertCrew(crew.name);
    console.log(`Crew: ${crew.name} (${crewId})`);
    for (const rider of crew.riders ?? []) {
      if (!E164.test(rider.phone)) {
        console.error(`  ! Skipping ${rider.name}: "${rider.phone}" is not E.164`);
        continue;
      }
      upsertRider(rider.phone, rider.name, crewId);
      console.log(`  + ${rider.name} ${rider.phone}`);
      riderCount++;
    }
  }
  console.log(`Done. Seeded ${riderCount} rider(s).`);
}

main();
