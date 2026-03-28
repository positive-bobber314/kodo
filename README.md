# kōdo (コード)

**Universal persistent memory for AI coding agents.**

【[English](README.md) | [中文](README.zh-CN.md)】

[![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-orange)](https://docs.anthropic.com/en/docs/claude-code)
[![Cursor](https://img.shields.io/badge/Cursor-compatible-blue)](https://cursor.sh)
[![Kiro](https://img.shields.io/badge/Kiro-compatible-green)](https://kiro.dev)
[![Codex CLI](https://img.shields.io/badge/Codex_CLI-compatible-purple)](https://github.com/openai/codex)
[![MCP](https://img.shields.io/badge/MCP-server-red)](https://modelcontextprotocol.io)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Your AI coding agent forgets everything between sessions. You tell it "use ESM imports" — next session, it's back to `require()`. You fix a bug caused by missing null checks — next session, same bug. **kōdo fixes that.**

An agent-agnostic memory layer that stores structured memories — conventions, mistakes, decisions, preferences, patterns — in a local SQLite database, and makes them available to **every** agent you use. One memory store. Every agent. Zero cloud.

```
kodo add -t convention -c "Always use ESM imports, never require()"
kodo add -t mistake    -c "Never use process.exit() in library code — throw instead"
kodo learn             # auto-learn from git history
kodo export            # sync to .claude/ .cursor/ .kiro/ .codex/
```

## The Problem: AI's Amnesia

Every AI coding agent starts every session with a blank slate. This means:

| What happens | How it feels |
|-------------|-------------|
| You correct the agent's code style | It forgets next session |
| You explain your architecture decisions | Gone. Every. Time. |
| The agent makes a mistake you've seen before | Groundhog Day |
| You switch from Cursor to Claude Code | Start over from scratch |
| New team member onboards with an agent | Zero institutional knowledge |

**kōdo gives your AI agent a persistent, structured, searchable memory that works across every tool.**

## Live Demo

```bash
# Clone and run the demo — see it in action in 30 seconds
git clone https://github.com/Xuan-1998/kodo.git
cd kodo && npm install
bash demo/demo.sh
```

### Demo Walkthrough

**Session 1:** You teach the agent your conventions.

```
$ kodo init
✓ kodo initialized at /your-project
  Database: .kodo/memory.db (0 memories)

$ kodo add -t convention -c "Always use ESM imports (import/export), never require()"
✓ Remembered #1 [convention] Always use ESM imports (import/export), never require()

$ kodo add -t mistake -c "Never use process.exit() in library code — throw errors instead"
✓ Remembered #2 [mistake] Never use process.exit() in library code — throw errors instead

$ kodo add -t decision -c "We chose SQLite over Postgres for local-first zero-config storage"
✓ Remembered #3 [decision] We chose SQLite over Postgres for local-first zero-config storage
```

**Session 2:** New day. Agent starts fresh. But kōdo remembers.

```
$ kodo search "import style"
#1 convention Always use ESM imports (import/export), never require() [javascript, imports]

$ kodo search "error handling"
#2 mistake Never use process.exit() in library code — throw errors instead [nodejs, error-handling]
```

**Export to every agent — one command:**

```
$ kodo export
✓ claude → .claude/settings/memory.md (6 memories)
✓ cursor → .cursor/rules/kodo-memory.md (6 memories)
✓ kiro   → .kiro/steering/kodo-memory.md (6 memories)
✓ codex  → .codex/memory.md (6 memories)
```

Your memories are now baked into every agent's context — even without the MCP server.

## Why kōdo?

| Existing tool | Limitation | kōdo's answer |
|--------------|-----------|---------------|
| `claude-mem` | Claude Code only | Works with Claude Code, Cursor, Kiro, Codex, any MCP client |
| `mem0` / OpenMemory | Generic memory, not coding-specific | Typed memories: convention, mistake, decision, preference, pattern, note |
| `byterover/cipher` | MCP-only, no offline export | MCP server + CLI + native config file generation for 4+ agents |
| Manual `.cursorrules` | One agent, manual maintenance | Auto-export to all agents from single source of truth |
| Nothing | Most people | `kodo learn` auto-extracts conventions from git history |

## Install

```bash
npm install -g kodo-memory
```

Or run from source:

```bash
git clone https://github.com/Xuan-1998/kodo.git
cd kodo && npm install
node bin/kodo.js init
```

## Memory Types

| Type | Use for | Example |
|------|---------|---------|
| `convention` | Team/project standards | "Use Conventional Commits" |
| `mistake` | Bugs to never repeat | "Don't forget to close DB connections in finally blocks" |
| `decision` | Architecture choices | "Chose SQLite over Postgres for simplicity" |
| `preference` | Coding style | "Prefer early returns over nested if/else" |
| `pattern` | Reusable solutions | "All API handlers: validate → execute → respond" |
| `note` | General context | "The payments module is being rewritten in Q2" |

## MCP Server

kōdo includes an MCP server so AI agents can read and write memories **live during a session** — the agent can `kodo_remember` a lesson it just learned, and `kodo_recall` relevant context before starting a task.

### Claude Code

```bash
claude mcp add kodo -- node /path/to/kodo/src/mcp-server.js
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kodo": {
      "command": "node",
      "args": ["/path/to/kodo/src/mcp-server.js"]
    }
  }
}
```

### Kiro

Add to `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "kodo": {
      "command": "node",
      "args": ["/path/to/kodo/src/mcp-server.js"]
    }
  }
}
```

### Any MCP Client

Same pattern — point your MCP config at `node /path/to/kodo/src/mcp-server.js`.

### MCP Tools

| Tool | Description |
|------|-------------|
| `kodo_remember` | Store a new memory (convention, mistake, decision, preference, pattern, note) |
| `kodo_recall` | Search memories by query, type, or both — full-text search |
| `kodo_forget` | Delete a memory by ID |
| `kodo_stats` | Get memory statistics — total count, breakdown by type and project |

## Agent Export

`kodo export` generates **native config files** for each agent — your memories work even without the MCP server:

| Agent | Output path | Format |
|-------|-------------|--------|
| Claude Code | `.claude/settings/memory.md` | Markdown |
| Cursor | `.cursor/rules/kodo-memory.md` | Markdown rule |
| Kiro | `.kiro/steering/kodo-memory.md` | Steering file (YAML frontmatter) |
| Codex | `.codex/memory.md` | Markdown |

```bash
# Export to all agents
kodo export

# Export to specific agents only
kodo export --agents claude,kiro
```

## Git Learning

`kodo learn` analyzes your git history and **automatically extracts**:

- **Commit conventions** — detects Conventional Commits, prefixes, patterns
- **Hotspots** — areas with frequent fixes that need extra attention
- **Project info** — primary languages, frameworks, tooling detected from config files

```bash
$ kodo learn
✓ Learned 5 memories from git history

$ kodo search --type convention
#1 convention This project uses Conventional Commits (feat:, fix:, chore:, etc.) [git, commits]

$ kodo search --type mistake
#2 mistake Frequent fixes in "auth" (7 fix commits). This area may need extra attention. [git, hotspot, auth]
```

## CLI Reference

```
kodo init                          Initialize kodo in current project
kodo add -t <type> -c <content>    Add a memory (--tags "a,b" optional)
kodo search [query]                Search memories (full-text)
kodo search --type convention      Filter by type
kodo forget <id>                   Delete a memory
kodo stats                         Show memory statistics
kodo learn                         Auto-learn from git history
kodo export                        Export to all agent configs
kodo export --agents claude,kiro   Export to specific agents
```

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   You / AI  │────▶│  kōdo store  │────▶│  Agent configs   │
│  (CLI/MCP)  │     │  (SQLite +   │     │  .claude/        │
│             │◀────│   FTS5)      │     │  .cursor/rules/  │
│             │     │              │     │  .kiro/steering/  │
└─────────────┘     └──────────────┘     │  .codex/         │
                           ▲              └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │  git learn  │
                    │  (auto)     │
                    └─────────────┘
```

**Storage:** Memories live in `.kodo/memory.db` — a SQLite database with WAL mode and FTS5 full-text search. Add `.kodo/` to `.gitignore` for private memories, or commit it to share conventions with your team.

## Roadmap

- [x] `kodo import` — migrate from claude-mem / mem0 / JSONL
- [x] `kodo watch` — auto-learn from agent sessions in real-time
- [x] `kodo hub` — cross-terminal real-time knowledge sharing
- [x] `kodo pipe` — send long text to agent inbox without terminal lag
- [x] `kodo evolve` — self-evolving memory (prune/merge/promote)
- [ ] Semantic similarity search (embeddings) as optional upgrade
- [ ] `kodo sync` — team memory sharing via git
- [ ] VS Code extension with memory sidebar
- [ ] More agent exports (OpenCode, CodeBuddy)

## Works Well With

| Tool | How |
|------|-----|
| [PUA Skill](https://github.com/tanweai/pua) | PUA forces the agent to try harder; kōdo ensures it remembers what it learned |
| [claude-mem](https://github.com/thedotmack/claude-mem) | claude-mem captures sessions; kōdo structures and exports the knowledge |
| Any MCP client | kōdo is a standard MCP server — plug it into anything |

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Xuan-1998/kodo&type=Date)](https://star-history.com/#Xuan-1998/kodo&Date)

## Contributing

PRs welcome. The codebase is intentionally small — ~400 lines of JavaScript. That's a feature, not a limitation.

```bash
git clone https://github.com/Xuan-1998/kodo.git
cd kodo && npm install
node bin/kodo.js init
# hack away
```

## License

MIT
