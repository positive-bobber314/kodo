import { MemoryStore } from './store.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';

const EVOLVE_DIR = join(homedir(), '.kodo', 'evolve');

// Self-evolving: kodo uses its own memories to improve its recall quality
// Inspired by CORAL's eval loop — grade, iterate, keep best

export function evolve(projectDir) {
  const store = new MemoryStore(projectDir);
  if (!existsSync(EVOLVE_DIR)) mkdirSync(EVOLVE_DIR, { recursive: true });

  const stats = store.stats();
  const allMemories = store.search(null, { limit: 1000 });

  // 1. Prune: remove low-value memories (never accessed, old)
  const pruned = [];
  for (const m of allMemories) {
    const ageMs = Date.now() - new Date(m.created_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (m.access_count === 0 && ageDays > 30) {
      pruned.push(m);
    }
  }

  // 2. Merge: find near-duplicate memories and consolidate
  const merged = [];
  const seen = new Set();
  for (let i = 0; i < allMemories.length; i++) {
    if (seen.has(i)) continue;
    for (let j = i + 1; j < allMemories.length; j++) {
      if (seen.has(j)) continue;
      if (allMemories[i].type === allMemories[j].type && similarity(allMemories[i].content, allMemories[j].content) > 0.7) {
        // Keep the one with higher access count
        const keep = allMemories[i].access_count >= allMemories[j].access_count ? i : j;
        const drop = keep === i ? j : i;
        merged.push({ keep: allMemories[keep], drop: allMemories[drop] });
        seen.add(drop);
      }
    }
  }

  // 3. Promote: boost relevance_score of frequently accessed memories
  const promoted = [];
  for (const m of allMemories) {
    if (m.access_count >= 5 && m.relevance_score < 2.0) {
      const newScore = Math.min(m.relevance_score + 0.5, 3.0);
      promoted.push({ id: m.id, oldScore: m.relevance_score, newScore });
    }
  }

  // 4. Log evolution
  const log = {
    ts: new Date().toISOString(),
    before: stats.total,
    pruned: pruned.length,
    merged: merged.length,
    promoted: promoted.length,
    after: stats.total - pruned.length - merged.length,
  };

  return { pruned, merged, promoted, log, apply };

  function apply() {
    for (const m of pruned) store.delete(m.id);
    for (const { drop } of merged) store.delete(drop.id);
    for (const { id, newScore } of promoted) store.update(id, { relevance_score: newScore });

    // Save evolution log
    const logPath = join(EVOLVE_DIR, `${Date.now()}.json`);
    writeFileSync(logPath, JSON.stringify(log, null, 2));
    store.close();
    return log;
  }
}

// Simple word-overlap similarity (no deps needed)
function similarity(a, b) {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const intersection = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : intersection / union;
}
