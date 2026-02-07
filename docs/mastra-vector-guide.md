# MastraVector Integration Guide

`@peleke/mastra-qortex` implements Mastra's `MastraVector` abstract class. It works anywhere Mastra expects a vector store: agents, workflows, RAG pipelines, `query()`, `upsert()`, etc.

qortex augments standard vector search with graph structure, rules, and feedback-driven learning. This package gives Mastra users access to those capabilities through the API they already know.

## Setup

### Spawn qortex server automatically

```typescript
import { QortexVector } from "@peleke/mastra-qortex";

const qortex = new QortexVector({
  id: "qortex",
  serverCommand: "uvx",
  serverArgs: ["qortex", "mcp-serve"],
});

await qortex.createIndex({ indexName: "docs", dimension: 384, metric: "cosine" });
```

The qortex MCP server is spawned as a subprocess and communicates over stdio.

### Connect to existing MCP server

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const mcpClient = new Client(/* your config */);
await mcpClient.connect(/* your transport */);

const qortex = new QortexVector({
  id: "qortex",
  mcpClient,
});
```

## Standard MastraVector API

### createIndex / listIndexes / describeIndex / deleteIndex

```typescript
await qortex.createIndex({ indexName: "docs", dimension: 384 });

const indexes = await qortex.listIndexes();
// ["docs"]

const stats = await qortex.describeIndex({ indexName: "docs" });
// { dimension: 384, count: 0, metric: "cosine" }

await qortex.deleteIndex({ indexName: "docs" });
```

### upsert

```typescript
const ids = await qortex.upsert({
  indexName: "docs",
  vectors: embeddings,
  metadata: [
    { text: "OAuth2 is an authorization framework", source: "handbook" },
    { text: "JWT tokens carry signed claims", source: "handbook" },
  ],
  ids: ["sec:oauth", "sec:jwt"],
});
```

### query

```typescript
const results = await qortex.query({
  indexName: "docs",
  queryVector: queryEmbedding,
  topK: 10,
  filter: { source: "handbook" },
});

for (const result of results) {
  console.log(result.id);       // "sec:oauth"
  console.log(result.score);    // 0.94
  console.log(result.metadata); // { text: "...", source: "handbook" }
}
```

Supports MongoDB-like metadata filters: `$eq`, `$ne`, `$gt`, `$lt`, `$in`, `$and`, `$or`.

### updateVector

```typescript
// By ID
await qortex.updateVector({
  indexName: "docs",
  id: "sec:oauth",
  update: { metadata: { reviewed: true } },
});

// By filter
await qortex.updateVector({
  indexName: "docs",
  filter: { source: "handbook" },
  update: { metadata: { status: "archived" } },
});
```

### deleteVector / deleteVectors

```typescript
await qortex.deleteVector({ indexName: "docs", id: "sec:oauth" });

// Bulk by IDs
await qortex.deleteVectors({ indexName: "docs", ids: ["sec:jwt", "sec:rbac"] });

// Bulk by filter
await qortex.deleteVectors({
  indexName: "docs",
  filter: { source: "old-handbook" },
});
```

## Graph exploration

After a text-level query, use `node_id` from any result to explore the knowledge graph:

```typescript
const queryResult = await qortex.textQuery("OAuth2 authorization", {
  domains: ["security"],
  mode: "graph",
});

const explored = await qortex.explore(queryResult.items[0].node_id);

// The node itself
console.log(explored.node.name);        // "OAuth2"
console.log(explored.node.description); // Full description

// Typed edges (structurally related, not just textually similar)
for (const edge of explored.edges) {
  console.log(`${edge.source_id} --${edge.relation_type}--> ${edge.target_id}`);
}

// Neighbor nodes
for (const neighbor of explored.neighbors) {
  console.log(`${neighbor.name}: ${neighbor.description}`);
}

// Rules linked to this concept
for (const rule of explored.rules) {
  console.log(`[${rule.category}] ${rule.text}`);
}
```

`explore()` supports depth 1-3 (default 1 = immediate neighbors). Returns `null` if the node doesn't exist.

## Rules

Query rules directly:

```typescript
// Rules for specific concepts
const rules = await qortex.getRules({
  conceptIds: queryResult.items.map(i => i.node_id),
});

// Rules by category
const archRules = await qortex.getRules({
  categories: ["architectural"],
});

// Rules by domain
const securityRules = await qortex.getRules({
  domains: ["security"],
});
```

## Feedback loop

Tell qortex which results were useful. Accepted concepts get higher PPR teleportation probability on future queries. Rejected concepts get lower.

```typescript
const queryResult = await qortex.textQuery("authentication", {
  domains: ["security"],
});

// Use the results in your application...

// Then report what worked
await qortex.feedback(queryResult.query_id, {
  [queryResult.items[0].id]: "accepted",
  [queryResult.items[4].id]: "rejected",
});

// Future queries benefit from this signal
```

## What's proven

| Claim | Evidence |
|-------|----------|
| MastraVector compliance | All 9 abstract methods implemented |
| Vector query works | `query()` returns `QueryResult[]` with scores |
| MongoDB-like filters | Equality, $ne, $gt, $lt, $in, $and, $or |
| Graph exploration | `explore()` returns typed edges, neighbors, rules |
| Rules auto-surfaced | `textQuery()` results include linked rules |
| Feedback recorded | `feedback()` adjusts PPR teleportation factors |
| MCP transport | All operations via stdio JSON-RPC |

## What qortex adds to Mastra

| Dimension | Mastra | + qortex |
|-----------|--------|----------|
| Search | Cosine similarity | + PPR graph walk |
| Structure | Flat metadata | + Typed edges (REQUIRES, REFINES...) |
| Navigation | — | Explore graph from any result |
| Rules | — | Auto-surfaced constraints and patterns |
| Learning | — | Feedback-driven teleportation factors |
| API | Standard MastraVector | + textQuery, explore, getRules, feedback |
