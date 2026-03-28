import { openDb, resolveDbPath, globalDbPath } from './db.js';
import { existsSync } from 'fs';

export class MemoryStore {
  constructor(projectDir, { create = false } = {}) {
    const projectDb = projectDir ? resolveDbPath(projectDir) : null;
    if (projectDb && (create || existsSync(projectDb))) {
      this.dbPath = projectDb;
    } else {
      this.dbPath = globalDbPath();
    }
    this.db = openDb(this.dbPath);
  }

  add({ type, content, tags = [], source = 'manual', project = '' }) {
    const stmt = this.db.prepare(
      'INSERT INTO memories (type, content, tags, source, project) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(type, content, JSON.stringify(tags), source, project);
    return info.lastInsertRowid;
  }

  search(query, { type, project, limit = 20 } = {}) {
    let sql, params;
    if (query) {
      // FTS search with optional filters
      const ftsQuery = query.split(/\s+/).map(w => `"${w}"`).join(' OR ');
      const where = [];
      params = [ftsQuery];
      if (type) { where.push('m.type = ?'); params.push(type); }
      if (project) { where.push('m.project = ?'); params.push(project); }
      const whereClause = where.length ? 'AND ' + where.join(' AND ') : '';
      sql = `SELECT m.*, rank FROM memories_fts f JOIN memories m ON f.rowid = m.id WHERE memories_fts MATCH ? ${whereClause} ORDER BY rank LIMIT ?`;
      params.push(limit);
    } else {
      const where = [];
      params = [];
      if (type) { where.push('type = ?'); params.push(type); }
      if (project) { where.push('project = ?'); params.push(project); }
      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
      sql = `SELECT * FROM memories ${whereClause} ORDER BY updated_at DESC LIMIT ?`;
      params.push(limit);
    }
    const rows = this.db.prepare(sql).all(...params);
    // bump access count
    const bump = this.db.prepare('UPDATE memories SET access_count = access_count + 1 WHERE id = ?');
    for (const r of rows) bump.run(r.id);
    return rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
    return row ? { ...row, tags: JSON.parse(row.tags || '[]') } : null;
  }

  update(id, fields) {
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(fields)) {
      if (['type', 'content', 'tags', 'source', 'project', 'relevance_score'].includes(k)) {
        sets.push(`${k} = ?`);
        params.push(k === 'tags' ? JSON.stringify(v) : v);
      }
    }
    if (!sets.length) return false;
    sets.push("updated_at = datetime('now')");
    params.push(id);
    this.db.prepare(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return true;
  }

  delete(id) {
    return this.db.prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0;
  }

  stats() {
    const total = this.db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
    const byType = this.db.prepare('SELECT type, COUNT(*) as c FROM memories GROUP BY type').all();
    const byProject = this.db.prepare('SELECT project, COUNT(*) as c FROM memories GROUP BY project ORDER BY c DESC LIMIT 10').all();
    return { total, byType: Object.fromEntries(byType.map(r => [r.type, r.c])), byProject };
  }

  close() {
    this.db.close();
  }
}
