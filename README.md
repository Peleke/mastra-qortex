<div align="center">

# @peleke.s/mastra-qortex

### MastraVector Backed by Graph-Enhanced Retrieval

[![npm](https://img.shields.io/npm/v/@peleke.s/mastra-qortex?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/@peleke.s/mastra-qortex)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

[MastraVector](https://mastra.ai/docs/reference/rag/vectors) backed by [qortex](https://github.com/Peleke/qortex) — graph-enhanced retrieval via MCP.

[Install](#install) · [Quick Start](#quick-start) · [Case Study](docs/case-study.md) · [qortex](https://github.com/Peleke/qortex)

</div>

A `MastraVector` implementation that gives any Mastra app access to qortex's knowledge graph. Works alongside Mastra's existing 22+ vector stores, adding:

- **Graph navigation** — typed edges, neighbors, and rules from any search result
- **Feedback-driven learning** — accepted results rank higher next time (PPR teleportation)
- **Rules auto-surfaced** — domain constraints and patterns linked to concepts

## Install

```bash
npm install @peleke.s/mastra-qortex
```

Requires a running qortex MCP server (`pip install qortex`).

## Quick start

```typescript
import { QortexVector } from "@peleke.s/mastra-qortex";

const qortex = new QortexVector({
  id: "qortex",
  serverCommand: "uvx",
  serverArgs: ["qortex", "mcp-serve"],
});

// Standard MastraVector API — works everywhere Mastra expects a vector store
await qortex.createIndex({ indexName: "docs", dimension: 384 });
await qortex.upsert({
  indexName: "docs",
  vectors: embeddings,
  metadata: chunks.map((c) => ({ text: c.text, source: c.source })),
});

const results = await qortex.query({
  indexName: "docs",
  queryVector: queryEmbedding,
  topK: 10,
});
```

## What qortex adds

### Graph exploration

```typescript
// Text-level query (uses qortex's embedding + optional PPR)
const queryResult = await qortex.textQuery("authentication protocols", {
  domains: ["security"],
  mode: "graph", // PPR-enhanced retrieval
});

// Navigate the knowledge graph from any result
const explored = await qortex.explore(queryResult.items[0].node_id);
console.log(explored.edges);     // Typed relationships
console.log(explored.neighbors); // Connected concepts
console.log(explored.rules);     // Linked rules
```

### Feedback loop

```typescript
// Tell qortex what worked
await qortex.feedback(queryResult.query_id, {
  [queryResult.items[0].id]: "accepted",
  [queryResult.items[4].id]: "rejected",
});

// Future queries benefit from this signal
```

### Rules

```typescript
const rules = await qortex.getRules({
  domains: ["security"],
  categories: ["architectural"],
});

for (const rule of rules.rules) {
  console.log(`[${rule.category}] ${rule.text}`);
}
```

## Architecture

```
Mastra App (TypeScript)
  └── QortexVector extends MastraVector
       └── QortexMcpClient (stdio JSON-RPC)
            └── qortex MCP server (Python subprocess)
                 ├── VectorIndex (cosine similarity)
                 └── GraphBackend (PPR, rules, typed edges)
```

QortexVector talks to the qortex MCP server over stdio. The server manages vector indexes, the knowledge graph, and the feedback loop. All 9 MastraVector methods map to `qortex_vector_*` MCP tools.

## Documentation

- [MastraVector Integration Guide](docs/mastra-vector-guide.md) — full API reference
- [Case Study](docs/case-study.md) — why we built this, what we proved
- [qortex documentation](https://github.com/Peleke/qortex) — core library

## License

MIT
