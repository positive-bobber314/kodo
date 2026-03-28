# kōdo (コード)

**AI 编程 Agent 的通用持久记忆层。**

【[English](README.md) | [中文](README.zh-CN.md)】

[![Claude Code](https://img.shields.io/badge/Claude_Code-兼容-orange)](https://docs.anthropic.com/en/docs/claude-code)
[![Cursor](https://img.shields.io/badge/Cursor-兼容-blue)](https://cursor.sh)
[![Kiro](https://img.shields.io/badge/Kiro-兼容-green)](https://kiro.dev)
[![Codex CLI](https://img.shields.io/badge/Codex_CLI-兼容-purple)](https://github.com/openai/codex)
[![MCP](https://img.shields.io/badge/MCP-server-red)](https://modelcontextprotocol.io)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 你的 AI 编程 Agent 每次对话都从零开始。你告诉它"用 ESM imports"——下次对话，它又写 `require()`。你修了一个 null check 的 bug——下次对话，同样的 bug。**kōdo 解决这个问题。**

一个跨 Agent 的记忆层，将结构化记忆（规范、错误、决策、偏好、模式）存储在本地 SQLite 数据库中，并让你使用的**每一个** Agent 都能访问。一个记忆库，所有 Agent 共享，零云端依赖。

```
kodo add -t convention -c "始终使用 ESM imports，禁止 require()"
kodo add -t mistake    -c "库代码中禁止使用 process.exit()——应该 throw"
kodo learn             # 从 git 历史自动学习
kodo export            # 同步到 .claude/ .cursor/ .kiro/ .codex/
```

## 问题：AI 的失忆症

每个 AI 编程 Agent 每次对话都从白纸开始：

| 发生了什么 | 感受 |
|-----------|------|
| 你纠正了 Agent 的代码风格 | 下次对话就忘了 |
| 你解释了架构决策 | 每次都消失 |
| Agent 犯了你见过的错误 | 土拨鼠之日 |
| 你从 Cursor 切换到 Claude Code | 从零开始 |
| 新同事用 Agent 上手 | 零机构知识 |

**kōdo 给你的 AI Agent 一个持久的、结构化的、可搜索的记忆，跨所有工具通用。**

## 安装

```bash
npm install -g kodo-memory
```

或从源码运行：

```bash
git clone https://github.com/Xuan-1998/kodo.git
cd kodo && npm install
node bin/kodo.js init
```

## 记忆类型

| 类型 | 用途 | 示例 |
|------|------|------|
| `convention` | 团队/项目规范 | "使用 Conventional Commits" |
| `mistake` | 不再重犯的 bug | "finally 块中别忘了关闭 DB 连接" |
| `decision` | 架构决策 | "选择 SQLite 而非 Postgres，因为简单" |
| `preference` | 编码风格 | "优先使用 early return，避免嵌套 if/else" |
| `pattern` | 可复用方案 | "所有 API handler：校验 → 执行 → 响应" |
| `note` | 通用上下文 | "支付模块正在 Q2 重写" |

## 核心功能

### 🔗 跨终端知识共享

多个终端同时工作时，一个终端学到的知识会实时广播给其他终端：

```bash
kodo hub    # 启动共享中心（运行一次）
```

Agent 可以通过 `kodo_live` MCP 工具查看其他终端正在做什么。

### 📋 长文本管道

终端粘贴超长文本会卡？用 pipe 绕过：

```bash
pbpaste | kodo pipe "分析这篇论文"
# 然后在 kiro 里说："check my inbox"
```

### 🧬 自进化记忆

kōdo 的记忆会自我进化——清理无用记忆、合并重复、提升高价值记忆：

```bash
kodo evolve           # 自动优化记忆库
kodo evolve --dry-run # 预览变更
```

### 📚 Git 自动学习

```bash
kodo learn  # 从 git 历史自动提取规范、热点、项目信息
```

### 📤 导出到所有 Agent

```bash
kodo export                      # 导出到所有 Agent
kodo export --agents claude,kiro # 导出到指定 Agent
```

| Agent | 输出路径 | 格式 |
|-------|---------|------|
| Claude Code | `.claude/settings/memory.md` | Markdown |
| Cursor | `.cursor/rules/kodo-memory.md` | Markdown rule |
| Kiro | `.kiro/steering/kodo-memory.md` | Steering 文件 |
| Codex | `.codex/memory.md` | Markdown |

## MCP 服务器

kōdo 包含 MCP 服务器，AI Agent 可以在对话中**实时**读写记忆：

| 工具 | 描述 |
|------|------|
| `kodo_remember` | 存储新记忆 |
| `kodo_recall` | 按关键词/类型搜索记忆 |
| `kodo_forget` | 按 ID 删除记忆 |
| `kodo_stats` | 查看记忆统计 |
| `kodo_live` | 查看其他终端的实时动态 |
| `kodo_inbox` | 读取通过 `kodo pipe` 发送的长文本 |

### 配置

```bash
# Claude Code
claude mcp add kodo -- node /path/to/kodo/src/mcp-server.js

# Cursor — 添加到 .cursor/mcp.json
# Kiro — 添加到 .kiro/settings/mcp.json
```

## CLI 参考

```
kodo init                          初始化项目
kodo add -t <type> -c <content>    添加记忆
kodo search [query]                搜索记忆
kodo forget <id>                   删除记忆
kodo stats                         查看统计
kodo learn                         从 git 自动学习
kodo export                        导出到 Agent 配置
kodo watch                         实时监听 Agent 会话
kodo hub                           启动跨终端共享中心
kodo pipe [prompt]                 管道发送长文本
kodo evolve                        自进化记忆优化
kodo import -s <source> -p <path>  导入外部记忆
```

## 架构

```
┌───────────┐    ┌────────────┐    ┌─────────────────┐
│  你 / AI  │───▶│ kōdo store │───▶│  Agent configs   │
│ (CLI/MCP) │    │ (SQLite +  │    │  .claude/        │
│           │◀───│   FTS5)    │    │  .cursor/rules/  │
└───────────┘    └─────┬──────┘    │  .kiro/steering/ │
      │                │           │  .codex/         │
      │          ┌─────┴─────┐     └─────────────────┘
      │          │ git learn │
      │          └───────────┘
      │
 ┌────┴────┐
 │kodo hub │ ◀── real-time broadcast (Unix socket pub/sub)
 └─────────┘
```

## 路线图

- [x] `kodo import` — 从 claude-mem / mem0 / JSONL 迁移
- [x] `kodo watch` — 实时监听 Agent 会话自动学习
- [x] `kodo hub` — 跨终端实时知识共享
- [x] `kodo pipe` — 长文本管道，避免终端卡顿
- [x] `kodo evolve` — 自进化记忆（清理/合并/提升）
- [ ] 语义相似度搜索（embeddings）
- [ ] `kodo sync` — 通过 git 团队共享记忆
- [ ] VS Code 扩展

## 搭配使用

| 工具 | 方式 |
|------|------|
| [PUA Skill](https://github.com/tanweai/pua) | PUA 逼 Agent 更努力；kōdo 确保它记住学到的东西 |
| [CORAL](https://github.com/Human-Agent-Society/CORAL) | 多 Agent 自进化框架；kōdo 提供持久记忆层 |
| 任何 MCP 客户端 | kōdo 是标准 MCP 服务器——即插即用 |

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=Xuan-1998/kodo&type=Date)](https://star-history.com/#Xuan-1998/kodo&Date)

## 贡献

欢迎 PR。代码库故意保持精简——约 500 行 JavaScript。这是特性，不是缺陷。

## 许可证

MIT
