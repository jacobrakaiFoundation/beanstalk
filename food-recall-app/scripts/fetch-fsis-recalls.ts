/**
 * Build-time script: fetches the official FSIS Recall API,
 * keeps non-archived records, normalizes them with the shared
 * mapper, and writes public/fsis-recalls.json as static JSON.
 *
 * Only active records are bundled: the full API history is
 * thousands of closed recalls and would bloat the client bundle.
 *
 * Run: tsx scripts/fetch-fsis-recalls.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isArchived, mapFsisRecord, type FsisApiRecord } from '../src/lib/fsis.ts'
import type { Recall } from '../src/types/recall'

const FSIS_API_URL = 'https://www.fsis.usda.gov/fsis/api/recall/v/1'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(__dirname, '..', 'public', 'fsis-recalls.json')

async function main() {
  console.log(`Fetching FSIS recalls from ${FSIS_API_URL}...`)
  const res = await fetch(FSIS_API_URL, {
    headers: { 'User-Agent': 'Beanstalk-FoodRecall/1.0 (build script)' },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    throw new Error(`FSIS API fetch failed: ${res.status} ${res.statusText}`)
  }
  const data: unknown = await res.json()
  if (!Array.isArray(data)) {
    throw new Error('FSIS API returned a non-array payload')
  }
  console.log(`Received ${(data as unknown[]).length} API records.`)

  const recalls: Recall[] = []
  let archived = 0
  for (const item of data as FsisApiRecord[]) {
    if (isArchived(item)) {
      archived += 1
      continue
    }
    const mapped = mapFsisRecord(item)
    if (mapped) recalls.push(mapped)
  }

  // Deduplicate by id, newest first for a deterministic file
  const seen = new Set<string>()
  const deduped: Recall[] = []
  for (const r of recalls) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      deduped.push(r)
    }
  }
  deduped.sort((a, b) => b.recallInitiationDate.localeCompare(a.recallInitiationDate))

  console.log(`Kept ${deduped.length} active FSIS recalls (skipped ${archived} archived).`)

  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(deduped, null, 2), 'utf-8')
  console.log(`Wrote ${OUT_PATH}`)
}

main().catch(err => {
  console.error('FSIS fetch failed:', err)
  process.exit(1)
})
