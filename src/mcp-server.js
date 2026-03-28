import { MemoryStore } from './store.js';
import { HubClient } from './hub.js';
import { checkInbox, consumeInbox } from './pipe.js';
import { evolve } from './evolve.js';

const store = new MemoryStore(process.cwd());
const hub = new HubClient();
hub.connect();

// Ring buffer of recent events from other terminals
const liveEvents = [];
const MAX_LIVE = 50;

hub.onEvent((evt) => {
  liveEvents.push(evt);
  if (liveEvents.length > MAX_LIVE) liveEvents.shift();
});

const TOOLS = [
  {
    name: 'kodo_remember',
    description: 'Store a memory — a convention, mistake, decision, preference, pattern, or note learned during this session. Use this whenever you discover something worth remembering for future sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['convention', 'mistake', 'decision', 'preference', 'pattern', 'note'], description: 'Memory type' },
        content: { type: 'string', description: 'What to remember' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
      },
      required: ['type', 'content'],
    },
  },
  {
    name: 'kodo_recall',
    description: 'Search memories for relevant context. Use this at the start of a task to recall conventions, past mistakes, and decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        type: { type: 'string', enum: ['convention', 'mistake', 'decision', 'preference', 'pattern', 'note'], description: 'Filter by type' },
        limit: { type: 'number', description: 'Max results', default: 10 },
      },
    },
  },
  {
    name: 'kodo_forget',
    description: 'Delete a memory by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Memory ID to delete' } },
      required: ['id'],
    },
  },
  {
    name: 'kodo_stats',
    description: 'Get memory statistics — total count, breakdown by type and project.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kodo_live',
    description: 'See what other terminals/sessions are doing right now. Shows recent memories and activities from other kodo-connected sessions. Use this to get context from parallel work happening in other terminals.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max events to show', default: 20 },
        query: { type: 'string', description: 'Filter events by keyword' },
      },
    },
  },
  {
    name: 'kodo_inbox',
    description: 'Check the inbox for long text piped from other terminals via `kodo pipe`. Use this when the user says they piped something or you want to check for pending input. Returns the full content that was too long to paste into the terminal directly.',
    inputSchema: {
      type: 'object',
      properties: {
        consume: { type: 'boolean', description: 'Remove messages after reading (default true)', default: true },
      },
    },
  },
];

function handleToolCall(name, args) {
  switch (name) {
    case 'kodo_remember': {
      const id = store.add({
        type: args.type,
        content: args.content,
        tags: args.tags || [],
        source: 'agent',
        project: process.cwd().split('/').pop(),
      });
      // Broadcast to other terminals
      hub.publish({ type: 'memory', memoryType: args.type, content: args.content, id, tags: args.tags || [] });
      return { content: [{ type: 'text', text: `Remembered (id=${id}): [${args.type}] ${args.content.slice(0, 80)}...` }] };
    }
    case 'kodo_recall': {
      const results = store.search(args.query || null, { type: args.type, limit: args.limit || 10 });
      if (!results.length) return { content: [{ type: 'text', text: 'No memories found.' }] };
      const text = results.map(r => `[#${r.id} ${r.type}] ${r.content}${r.tags.length ? ` (tags: ${r.tags.join(', ')})` : ''}`).join('\n\n');
      return { content: [{ type: 'text', text }] };
    }
    case 'kodo_forget': {
      const ok = store.delete(args.id);
      return { content: [{ type: 'text', text: ok ? `Deleted memory #${args.id}.` : `Memory #${args.id} not found.` }] };
    }
    case 'kodo_stats': {
      const s = store.stats();
      return { content: [{ type: 'text', text: JSON.stringify(s, null, 2) }] };
    }
    case 'kodo_live': {
      const limit = args.limit || 20;
      const q = args.query?.toLowerCase();
      let events = q ? liveEvents.filter(e => (e.content || '').toLowerCase().includes(q)) : liveEvents;
      events = events.slice(-limit);
      if (!events.length) return { content: [{ type: 'text', text: 'No live events from other terminals yet. Make sure `kodo hub` is running.' }] };
      const text = events.map(e => {
        const ago = Math.round((Date.now() - e.ts) / 1000);
        const time = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
        return `[${time}] [${e.memoryType || e.type}] ${(e.content || '').slice(0, 120)} (from session ${e.from?.slice(0, 8)})`;
      }).join('\n');
      return { content: [{ type: 'text', text: `Live feed from other terminals:\n\n${text}` }] };
    }
    case 'kodo_inbox': {
      const items = checkInbox();
      if (!items.length) return { content: [{ type: 'text', text: 'Inbox empty. Nothing piped.' }] };
      const parts = items.map(item => {
        const ago = Math.round((Date.now() - item.ts) / 1000);
        const time = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
        const header = item.prompt ? `**Prompt (${time}):** ${item.prompt}\n\n` : `**Piped ${time}:**\n\n`;
        return header + item.content;
      });
      if (args.consume !== false) items.forEach(i => consumeInbox(i.file));
      return { content: [{ type: 'text', text: parts.join('\n\n---\n\n') }] };
    }
    default:
      throw { code: -32601, message: `Unknown tool: ${name}` };
  }
}

// JSON-RPC stdio transport
let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let boundary;
  while ((boundary = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, boundary).trim();
    buffer = buffer.slice(boundary + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      const resp = handleMessage(msg);
      if (resp) send(resp);
    } catch (e) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
  }
});

function handleMessage(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'kodo', version: '0.2.0' },
        },
      };
    case 'notifications/initialized':
      return null;
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    case 'tools/call':
      try {
        const result = handleToolCall(params.name, params.arguments || {});
        return { jsonrpc: '2.0', id, result };
      } catch (e) {
        return { jsonrpc: '2.0', id, error: { code: e.code || -32603, message: e.message } };
      }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

process.on('SIGINT', () => { hub.close(); store.close(); process.exit(0); });
process.on('SIGTERM', () => { hub.close(); store.close(); process.exit(0); });
