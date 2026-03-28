#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { MemoryStore } from '../src/store.js';
import { exportMemories } from '../src/export.js';
import { learnFromGit } from '../src/git-learn.js';
import { importMemories } from '../src/import.js';
import { watchSessions } from '../src/watch.js';
import { startHub } from '../src/hub.js';
import { pipe } from '../src/pipe.js';
import { evolve } from '../src/evolve.js';

const program = new Command();
const cwd = process.cwd();

program
  .name('kodo')
  .description('Universal persistent memory for AI coding agents')
  .version('0.1.0');

program
  .command('add')
  .description('Add a memory')
  .requiredOption('-t, --type <type>', 'convention | mistake | decision | preference | pattern | note')
  .requiredOption('-c, --content <content>', 'What to remember')
  .option('--tags <tags>', 'Comma-separated tags', '')
  .action((opts) => {
    const store = new MemoryStore(cwd);
    const id = store.add({
      type: opts.type,
      content: opts.content,
      tags: opts.tags ? opts.tags.split(',').map(t => t.trim()) : [],
      project: cwd.split('/').pop(),
    });
    store.close();
    console.log(chalk.green(`✓ Remembered #${id}`) + ` [${opts.type}] ${opts.content.slice(0, 60)}`);
  });

program
  .command('search [query]')
  .description('Search memories')
  .option('-t, --type <type>', 'Filter by type')
  .option('-n, --limit <n>', 'Max results', '10')
  .action((query, opts) => {
    const store = new MemoryStore(cwd);
    const results = store.search(query || null, { type: opts.type, limit: parseInt(opts.limit) });
    store.close();
    if (!results.length) { console.log(chalk.dim('No memories found.')); return; }
    for (const r of results) {
      const tags = r.tags.length ? chalk.dim(` [${r.tags.join(', ')}]`) : '';
      console.log(`${chalk.cyan(`#${r.id}`)} ${chalk.yellow(r.type)} ${r.content.slice(0, 100)}${tags}`);
    }
    console.log(chalk.dim(`\n${results.length} result(s)`));
  });

program
  .command('forget <id>')
  .description('Delete a memory')
  .action((id) => {
    const store = new MemoryStore(cwd);
    const ok = store.delete(parseInt(id));
    store.close();
    console.log(ok ? chalk.green(`✓ Forgot #${id}`) : chalk.red(`Memory #${id} not found`));
  });

program
  .command('stats')
  .description('Show memory statistics')
  .action(() => {
    const store = new MemoryStore(cwd);
    const s = store.stats();
    store.close();
    console.log(chalk.bold(`Total memories: ${s.total}`));
    if (Object.keys(s.byType).length) {
      console.log(chalk.dim('\nBy type:'));
      for (const [t, c] of Object.entries(s.byType)) console.log(`  ${chalk.yellow(t)}: ${c}`);
    }
    if (s.byProject.length) {
      console.log(chalk.dim('\nBy project:'));
      for (const { project, c } of s.byProject) console.log(`  ${project || '(global)'}: ${c}`);
    }
  });

program
  .command('learn')
  .description('Auto-learn conventions from git history')
  .action(() => {
    const { added } = learnFromGit(cwd);
    console.log(added ? chalk.green(`✓ Learned ${added} memories from git history`) : chalk.dim('Nothing new to learn.'));
  });

program
  .command('export')
  .description('Export memories to agent config files')
  .option('-a, --agents <agents>', 'Comma-separated agents: claude,cursor,kiro,codex', 'claude,cursor,kiro,codex')
  .action((opts) => {
    const agents = opts.agents.split(',').map(a => a.trim());
    const results = exportMemories(cwd, agents);
    for (const r of results) {
      console.log(chalk.green(`✓ ${r.agent}`) + ` → ${r.path} (${r.count} memories)`);
    }
  });

program
  .command('init')
  .description('Initialize kodo in the current project')
  .action(() => {
    const store = new MemoryStore(cwd, { create: true });
    const s = store.stats();
    store.close();
    console.log(chalk.green('✓ kodo initialized') + ` at ${cwd}`);
    console.log(chalk.dim(`  Database: .kodo/memory.db (${s.total} memories)`));
    console.log(chalk.dim('\nQuick start:'));
    console.log(chalk.dim('  kodo add -t convention -c "Use snake_case for DB columns"'));
    console.log(chalk.dim('  kodo learn          # auto-learn from git'));
    console.log(chalk.dim('  kodo export         # export to agent configs'));
    console.log(chalk.dim('  kodo search "style" # search memories'));
  });

program
  .command('import')
  .description('Import memories from claude-mem, mem0, or JSONL session logs')
  .requiredOption('-s, --source <source>', 'Source: claude-mem | mem0 | jsonl')
  .requiredOption('-p, --path <path>', 'Path to source data (directory, db file, or jsonl file)')
  .action((opts) => {
    try {
      const { added, source } = importMemories(cwd, opts.source, opts.path);
      console.log(chalk.green(`✓ Imported ${added} memories from ${source}`));
    } catch (e) {
      console.error(chalk.red(`✗ ${e.message}`));
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('Watch agent sessions and auto-learn memories in real-time')
  .action(() => {
    console.log(chalk.cyan('👁  Watching agent sessions for memories...'));
    const result = watchSessions(cwd, {
      onMemory: ({ id, type, content, agent }) => {
        console.log(chalk.green(`✓ #${id}`) + ` [${chalk.yellow(type)}] ${content.slice(0, 80)} ${chalk.dim(`(${agent})`)}`);
      },
      onError: (msg) => {
        console.error(chalk.red(`✗ ${msg}`));
        process.exit(1);
      },
    });
    if (result.dirs) {
      for (const d of result.dirs) console.log(chalk.dim(`  Watching: ${d}`));
    }
    console.log(chalk.dim('\n  Press Ctrl+C to stop.\n'));
    process.on('SIGINT', () => { result.stop(); console.log(chalk.dim('\nStopped.')); process.exit(0); });
  });

program
  .command('pipe [prompt]')
  .description('Pipe long text to kiro/agent inbox. Reads from stdin. Usage: pbpaste | kodo pipe "analyze this"')
  .action((prompt) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      if (!data.trim()) { console.error(chalk.red('Nothing on stdin. Usage: pbpaste | kodo pipe "prompt"')); process.exit(1); }
      const id = pipe(prompt || '', data);
      const kb = (Buffer.byteLength(data) / 1024).toFixed(1);
      console.log(chalk.green(`✓ Piped ${kb}KB to inbox`) + chalk.dim(` (${id})`));
      console.log(chalk.dim('  Agent will see it via kodo_inbox tool'));
    });
  });

program
  .command('evolve')
  .description('Self-evolve: prune dead memories, merge duplicates, promote high-value ones')
  .option('--dry-run', 'Show what would change without applying')
  .action((opts) => {
    const result = evolve(cwd);
    console.log(chalk.cyan('🧬 Evolution analysis:'));
    console.log(`  ${chalk.red(`Prune: ${result.pruned.length}`)} memories (0 access, >30 days old)`);
    for (const m of result.pruned.slice(0, 5)) console.log(chalk.dim(`    #${m.id} ${m.content.slice(0, 60)}`));
    console.log(`  ${chalk.yellow(`Merge: ${result.merged.length}`)} near-duplicate pairs`);
    for (const { keep, drop } of result.merged.slice(0, 5)) console.log(chalk.dim(`    keep #${keep.id}, drop #${drop.id}: ${drop.content.slice(0, 50)}`));
    console.log(`  ${chalk.green(`Promote: ${result.promoted.length}`)} high-value memories`);
    for (const p of result.promoted.slice(0, 5)) console.log(chalk.dim(`    #${p.id} score ${p.oldScore} → ${p.newScore}`));
    if (opts.dryRun) {
      console.log(chalk.dim('\n  --dry-run: no changes applied'));
    } else {
      const log = result.apply();
      console.log(chalk.green(`\n✓ Evolved: ${log.before} → ${log.after} memories`));
    }
  });

program
  .command('hub')
  .description('Start the cross-terminal knowledge sharing hub (run once, keeps running in background)')
  .action(() => {
    console.log(chalk.cyan('🔗 kodo hub running — cross-terminal sharing active'));
    console.log(chalk.dim('  Socket: ~/.kodo/hub.sock'));
    console.log(chalk.dim('  Press Ctrl+C to stop.\n'));
    const { stop } = startHub();
    process.on('SIGINT', () => { stop(); console.log(chalk.dim('\nHub stopped.')); process.exit(0); });
    process.on('SIGTERM', () => { stop(); process.exit(0); });
  });

program.parse();
