#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { MemoryStore } from '../src/store.js';
import { exportMemories } from '../src/export.js';
import { learnFromGit } from '../src/git-learn.js';

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

program.parse();
