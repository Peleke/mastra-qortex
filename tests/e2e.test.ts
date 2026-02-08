/**
 * Real E2E integration test for @peleke/mastra-qortex.
 *
 * This test spawns the actual qortex MCP server (from PyPI, via uvx)
 * as a subprocess, connects over stdio, and runs the full MastraVector
 * lifecycle through real MCP transport. No mocks.
 *
 * Prerequisites:
 *   - uvx installed (pip install uv)
 *   - qortex >= 0.2.0 on PyPI (has qortex_vector_* tools)
 *
 * Run:
 *   npx vitest run tests/e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { QortexVector } from "../src/vector.js";

// Timeout for the whole suite — server spawn + tool calls
const E2E_TIMEOUT = 60_000;

describe("Real E2E: QortexVector over stdio MCP", () => {
  let qortex: QortexVector;

  beforeAll(async () => {
    qortex = new QortexVector({
      id: "e2e-test",
      serverCommand: "uvx",
      serverArgs: ["qortex", "mcp-serve"],
    });

    // Actually connect — spawns the qortex server subprocess
    await qortex.connect();
  }, E2E_TIMEOUT);

  afterAll(async () => {
    await qortex.disconnect();
  });

  // ---------------------------------------------------------------------------
  // MastraVector abstract methods (the 9 required ones)
  // ---------------------------------------------------------------------------

  it(
    "createIndex: creates a named vector index",
    async () => {
      await qortex.createIndex({
        indexName: "e2e-docs",
        dimension: 4,
        metric: "cosine",
      });

      // Verify it exists
      const indexes = await qortex.listIndexes();
      expect(indexes).toContain("e2e-docs");
    },
    E2E_TIMEOUT,
  );

  it(
    "describeIndex: returns dimension, count, metric",
    async () => {
      const stats = await qortex.describeIndex({ indexName: "e2e-docs" });
      expect(stats.dimension).toBe(4);
      expect(stats.count).toBe(0);
      expect(stats.metric).toBe("cosine");
    },
    E2E_TIMEOUT,
  );

  it(
    "upsert: inserts vectors with metadata and documents",
    async () => {
      const ids = await qortex.upsert({
        indexName: "e2e-docs",
        vectors: [
          [1, 0, 0, 0],
          [0, 1, 0, 0],
          [0.7, 0.7, 0, 0],
          [0, 0, 1, 0],
          [0, 0, 0, 1],
        ],
        metadata: [
          { text: "OAuth2 authorization", category: "auth" },
          { text: "JWT token validation", category: "auth" },
          { text: "API key management", category: "auth" },
          { text: "Rate limiting", category: "infra" },
          { text: "Circuit breakers", category: "infra" },
        ],
        ids: ["doc-1", "doc-2", "doc-3", "doc-4", "doc-5"],
      });

      expect(ids).toEqual(["doc-1", "doc-2", "doc-3", "doc-4", "doc-5"]);

      const stats = await qortex.describeIndex({ indexName: "e2e-docs" });
      expect(stats.count).toBe(5);
    },
    E2E_TIMEOUT,
  );

  it(
    "query: returns results sorted by similarity",
    async () => {
      const results = await qortex.query({
        indexName: "e2e-docs",
        queryVector: [1, 0, 0, 0],
        topK: 3,
      });

      expect(results.length).toBe(3);
      // doc-1 is [1,0,0,0] — exact match, highest score
      expect(results[0].id).toBe("doc-1");
      expect(results[0].score).toBeGreaterThan(0.9);
      expect(results[0].metadata).toHaveProperty("text", "OAuth2 authorization");
    },
    E2E_TIMEOUT,
  );

  it(
    "query with filter: respects metadata filters",
    async () => {
      const results = await qortex.query({
        indexName: "e2e-docs",
        queryVector: [1, 0, 0, 0],
        topK: 10,
        filter: { category: "infra" },
      });

      // Only infra docs should come back
      expect(results.length).toBe(2);
      for (const r of results) {
        expect(r.metadata?.category).toBe("infra");
      }
    },
    E2E_TIMEOUT,
  );

  it(
    "updateVector: updates metadata on existing vector",
    async () => {
      await qortex.updateVector({
        indexName: "e2e-docs",
        id: "doc-1",
        update: {
          metadata: { reviewed: true, reviewer: "e2e-test" },
        },
      });

      // Query and verify metadata was merged
      const results = await qortex.query({
        indexName: "e2e-docs",
        queryVector: [1, 0, 0, 0],
        topK: 1,
      });
      expect(results[0].id).toBe("doc-1");
      expect(results[0].metadata?.reviewed).toBe(true);
      expect(results[0].metadata?.reviewer).toBe("e2e-test");
      // Original metadata should still be there
      expect(results[0].metadata?.text).toBe("OAuth2 authorization");
    },
    E2E_TIMEOUT,
  );

  it(
    "deleteVector: removes a single vector",
    async () => {
      await qortex.deleteVector({ indexName: "e2e-docs", id: "doc-5" });

      const stats = await qortex.describeIndex({ indexName: "e2e-docs" });
      expect(stats.count).toBe(4);
    },
    E2E_TIMEOUT,
  );

  it(
    "deleteVectors: removes multiple vectors by filter",
    async () => {
      await qortex.deleteVectors({
        indexName: "e2e-docs",
        filter: { category: "infra" },
      });

      const stats = await qortex.describeIndex({ indexName: "e2e-docs" });
      // doc-4 was infra, doc-5 already deleted — so only doc-4 removed here
      expect(stats.count).toBe(3);
    },
    E2E_TIMEOUT,
  );

  it(
    "deleteIndex: removes the entire index",
    async () => {
      await qortex.deleteIndex({ indexName: "e2e-docs" });

      const indexes = await qortex.listIndexes();
      expect(indexes).not.toContain("e2e-docs");
    },
    E2E_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  // Dimension validation (gauntlet fix — verify server rejects bad dimensions)
  // ---------------------------------------------------------------------------

  it(
    "rejects vectors with wrong dimension",
    async () => {
      await qortex.createIndex({
        indexName: "dim-test",
        dimension: 4,
      });

      await expect(
        qortex.upsert({
          indexName: "dim-test",
          vectors: [[1, 0]], // 2D into a 4D index
          ids: ["bad"],
        }),
      ).rejects.toThrow(/dimension/i);

      await qortex.deleteIndex({ indexName: "dim-test" });
    },
    E2E_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  // Full MastraVector lifecycle — like a real Mastra app would use it
  // ---------------------------------------------------------------------------

  it(
    "full lifecycle: create → upsert → query → update → delete → cleanup",
    async () => {
      // 1. Create
      await qortex.createIndex({ indexName: "lifecycle", dimension: 3 });

      // 2. Upsert
      const ids = await qortex.upsert({
        indexName: "lifecycle",
        vectors: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        metadata: [
          { topic: "auth", source: "docs" },
          { topic: "cache", source: "docs" },
          { topic: "queue", source: "blog" },
        ],
        ids: ["a", "b", "c"],
      });
      expect(ids).toHaveLength(3);

      // 3. Query
      const results = await qortex.query({
        indexName: "lifecycle",
        queryVector: [1, 0, 0],
        topK: 2,
      });
      expect(results[0].id).toBe("a");

      // 4. Query with filter
      const filtered = await qortex.query({
        indexName: "lifecycle",
        queryVector: [0.5, 0.5, 0],
        topK: 10,
        filter: { source: "blog" },
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("c");

      // 5. Update
      await qortex.updateVector({
        indexName: "lifecycle",
        id: "a",
        update: { metadata: { reviewed: true } },
      });

      // 6. Delete one
      await qortex.deleteVector({ indexName: "lifecycle", id: "c" });
      expect(
        (await qortex.describeIndex({ indexName: "lifecycle" })).count,
      ).toBe(2);

      // 7. Delete by filter
      await qortex.deleteVectors({
        indexName: "lifecycle",
        filter: { source: "docs" },
      });
      expect(
        (await qortex.describeIndex({ indexName: "lifecycle" })).count,
      ).toBe(0);

      // 8. Cleanup
      await qortex.deleteIndex({ indexName: "lifecycle" });
      expect(await qortex.listIndexes()).not.toContain("lifecycle");
    },
    E2E_TIMEOUT,
  );
});
