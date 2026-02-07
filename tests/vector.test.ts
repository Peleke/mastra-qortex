/**
 * Unit tests for QortexVector.
 *
 * Uses a mock MCP client to test all 9 MastraVector methods
 * and qortex extras (explore, rules, feedback, textQuery).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { QortexVector } from "../src/vector.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

// ---------------------------------------------------------------------------
// Mock MCP client
// ---------------------------------------------------------------------------

function createMockClient(): {
  client: Client;
  callTool: ReturnType<typeof vi.fn>;
} {
  const callTool = vi.fn();
  const client = {
    callTool,
  } as unknown as Client;
  return { client, callTool };
}

function mockResponse(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QortexVector", () => {
  let qortex: QortexVector;
  let callTool: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mock = createMockClient();
    callTool = mock.callTool;
    qortex = new QortexVector({
      id: "test-qortex",
      mcpClient: mock.client,
    });
  });

  // -----------------------------------------------------------------------
  // Index lifecycle
  // -----------------------------------------------------------------------

  describe("createIndex", () => {
    it("creates an index with dimension and metric", async () => {
      callTool.mockResolvedValue(
        mockResponse({ status: "created", index_name: "docs" }),
      );

      await qortex.createIndex({
        indexName: "docs",
        dimension: 384,
        metric: "cosine",
      });

      expect(callTool).toHaveBeenCalledWith({
        name: "qortex_vector_create_index",
        arguments: { index_name: "docs", dimension: 384, metric: "cosine" },
      });
    });

    it("throws on error response", async () => {
      callTool.mockResolvedValue(
        mockResponse({ error: "Dimension mismatch" }),
      );

      await expect(
        qortex.createIndex({ indexName: "docs", dimension: 384 }),
      ).rejects.toThrow("Dimension mismatch");
    });
  });

  describe("listIndexes", () => {
    it("returns index names", async () => {
      callTool.mockResolvedValue(
        mockResponse({ indexes: ["docs", "code"] }),
      );

      const indexes = await qortex.listIndexes();
      expect(indexes).toEqual(["docs", "code"]);
    });
  });

  describe("describeIndex", () => {
    it("returns index stats", async () => {
      callTool.mockResolvedValue(
        mockResponse({ dimension: 384, count: 42, metric: "cosine" }),
      );

      const stats = await qortex.describeIndex({ indexName: "docs" });
      expect(stats).toEqual({
        dimension: 384,
        count: 42,
        metric: "cosine",
      });
    });
  });

  describe("deleteIndex", () => {
    it("deletes an index", async () => {
      callTool.mockResolvedValue(
        mockResponse({ status: "deleted", index_name: "docs" }),
      );

      await qortex.deleteIndex({ indexName: "docs" });
      expect(callTool).toHaveBeenCalledWith({
        name: "qortex_vector_delete_index",
        arguments: { index_name: "docs" },
      });
    });
  });

  // -----------------------------------------------------------------------
  // CRUD operations
  // -----------------------------------------------------------------------

  describe("upsert", () => {
    it("upserts vectors with metadata and ids", async () => {
      callTool.mockResolvedValue(
        mockResponse({ ids: ["v1", "v2"] }),
      );

      const ids = await qortex.upsert({
        indexName: "docs",
        vectors: [[1, 0, 0], [0, 1, 0]],
        metadata: [{ source: "a" }, { source: "b" }],
        ids: ["v1", "v2"],
      });

      expect(ids).toEqual(["v1", "v2"]);
      expect(callTool).toHaveBeenCalledWith({
        name: "qortex_vector_upsert",
        arguments: {
          index_name: "docs",
          vectors: [[1, 0, 0], [0, 1, 0]],
          metadata: [{ source: "a" }, { source: "b" }],
          ids: ["v1", "v2"],
        },
      });
    });

    it("auto-generates ids when not provided", async () => {
      callTool.mockResolvedValue(
        mockResponse({ ids: ["auto-1"] }),
      );

      const ids = await qortex.upsert({
        indexName: "docs",
        vectors: [[1, 0, 0]],
      });

      expect(ids).toEqual(["auto-1"]);
    });
  });

  describe("query", () => {
    it("queries vectors with results", async () => {
      callTool.mockResolvedValue(
        mockResponse({
          results: [
            { id: "v1", score: 0.95, metadata: { source: "a" } },
            { id: "v2", score: 0.82, metadata: { source: "b" } },
          ],
        }),
      );

      const results = await qortex.query({
        indexName: "docs",
        queryVector: [1, 0, 0],
        topK: 5,
      });

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("v1");
      expect(results[0].score).toBe(0.95);
    });

    it("passes filter to MCP", async () => {
      callTool.mockResolvedValue(mockResponse({ results: [] }));

      await qortex.query({
        indexName: "docs",
        queryVector: [1, 0, 0],
        filter: { source: "handbook" },
      });

      expect(callTool).toHaveBeenCalledWith(
        expect.objectContaining({
          arguments: expect.objectContaining({
            filter: { source: "handbook" },
          }),
        }),
      );
    });
  });

  describe("updateVector", () => {
    it("updates by id", async () => {
      callTool.mockResolvedValue(
        mockResponse({ status: "updated", count: 1 }),
      );

      await qortex.updateVector({
        indexName: "docs",
        id: "v1",
        update: { metadata: { reviewed: true } },
      });

      expect(callTool).toHaveBeenCalledWith({
        name: "qortex_vector_update",
        arguments: {
          index_name: "docs",
          id: "v1",
          filter: undefined,
          vector: undefined,
          metadata: { reviewed: true },
        },
      });
    });
  });

  describe("deleteVector", () => {
    it("deletes by id", async () => {
      callTool.mockResolvedValue(
        mockResponse({ status: "deleted", id: "v1" }),
      );

      await qortex.deleteVector({ indexName: "docs", id: "v1" });
      expect(callTool).toHaveBeenCalledWith({
        name: "qortex_vector_delete",
        arguments: { index_name: "docs", id: "v1" },
      });
    });
  });

  describe("deleteVectors", () => {
    it("deletes by ids", async () => {
      callTool.mockResolvedValue(
        mockResponse({ status: "deleted", count: 2 }),
      );

      await qortex.deleteVectors({
        indexName: "docs",
        ids: ["v1", "v2"],
      });

      expect(callTool).toHaveBeenCalledWith({
        name: "qortex_vector_delete_many",
        arguments: {
          index_name: "docs",
          ids: ["v1", "v2"],
          filter: undefined,
        },
      });
    });

    it("deletes by filter", async () => {
      callTool.mockResolvedValue(
        mockResponse({ status: "deleted", count: 3 }),
      );

      await qortex.deleteVectors({
        indexName: "docs",
        filter: { source: "old" },
      });

      expect(callTool).toHaveBeenCalledWith({
        name: "qortex_vector_delete_many",
        arguments: {
          index_name: "docs",
          ids: undefined,
          filter: { source: "old" },
        },
      });
    });
  });

  // -----------------------------------------------------------------------
  // Qortex extras
  // -----------------------------------------------------------------------

  describe("textQuery", () => {
    it("queries by text with graph-enhanced retrieval", async () => {
      callTool.mockResolvedValue(
        mockResponse({
          items: [
            {
              id: "i-1",
              content: "OAuth2 framework",
              score: 0.94,
              domain: "security",
              node_id: "sec:oauth",
              metadata: {},
            },
          ],
          query_id: "q-abc",
          rules: [
            {
              id: "rule:oauth",
              text: "Use OAuth2 for API access",
              domain: "security",
              category: "security",
              relevance: 0.94,
            },
          ],
        }),
      );

      const result = await qortex.textQuery("OAuth2 auth", {
        domains: ["security"],
        mode: "graph",
        topK: 5,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].node_id).toBe("sec:oauth");
      expect(result.query_id).toBe("q-abc");
      expect(result.rules).toHaveLength(1);
    });
  });

  describe("explore", () => {
    it("returns graph neighborhood", async () => {
      callTool.mockResolvedValue(
        mockResponse({
          node: {
            id: "sec:oauth",
            name: "OAuth2",
            description: "Auth framework",
            domain: "security",
            confidence: 1.0,
            properties: {},
          },
          edges: [
            {
              source_id: "sec:oauth",
              target_id: "sec:jwt",
              relation_type: "REQUIRES",
              confidence: 0.9,
              properties: {},
            },
          ],
          neighbors: [
            {
              id: "sec:jwt",
              name: "JWT",
              description: "Signed tokens",
              domain: "security",
              confidence: 1.0,
              properties: {},
            },
          ],
          rules: [],
        }),
      );

      const result = await qortex.explore("sec:oauth");
      expect(result).not.toBeNull();
      expect(result!.node.name).toBe("OAuth2");
      expect(result!.edges).toHaveLength(1);
      expect(result!.edges[0].relation_type).toBe("REQUIRES");
      expect(result!.neighbors).toHaveLength(1);
    });

    it("returns null for missing node", async () => {
      callTool.mockResolvedValue(mockResponse({ node: null }));
      const result = await qortex.explore("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getRules", () => {
    it("queries rules by domain", async () => {
      callTool.mockResolvedValue(
        mockResponse({
          rules: [
            {
              id: "rule:1",
              text: "Use OAuth2",
              domain: "security",
              category: "architectural",
              confidence: 1.0,
              relevance: 0.9,
              derivation: "explicit",
              source_concepts: ["sec:oauth"],
              metadata: {},
            },
          ],
          domain_count: 1,
          projection: "rules",
        }),
      );

      const result = await qortex.getRules({ domains: ["security"] });
      expect(result.rules).toHaveLength(1);
      expect(result.projection).toBe("rules");
    });
  });

  describe("feedback", () => {
    it("submits feedback outcomes", async () => {
      callTool.mockResolvedValue(
        mockResponse({
          status: "recorded",
          query_id: "q-abc",
          outcome_count: 2,
          source: "mastra",
        }),
      );

      const result = await qortex.feedback("q-abc", {
        "i-1": "accepted",
        "i-5": "rejected",
      });

      expect(result.status).toBe("recorded");
      expect(result.outcome_count).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Full lifecycle (simulates Mastra app workflow)
  // -----------------------------------------------------------------------

  describe("full MastraVector lifecycle", () => {
    it("create → upsert → query → update → delete → cleanup", async () => {
      // 1. Create index
      callTool.mockResolvedValueOnce(
        mockResponse({ status: "created" }),
      );
      await qortex.createIndex({ indexName: "test", dimension: 4 });

      // 2. Upsert
      callTool.mockResolvedValueOnce(
        mockResponse({ ids: ["v1", "v2", "v3"] }),
      );
      const ids = await qortex.upsert({
        indexName: "test",
        vectors: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]],
        metadata: [
          { source: "doc1" },
          { source: "doc2" },
          { source: "doc3" },
        ],
        ids: ["v1", "v2", "v3"],
      });
      expect(ids).toHaveLength(3);

      // 3. Describe
      callTool.mockResolvedValueOnce(
        mockResponse({ dimension: 4, count: 3, metric: "cosine" }),
      );
      const stats = await qortex.describeIndex({ indexName: "test" });
      expect(stats.count).toBe(3);

      // 4. Query
      callTool.mockResolvedValueOnce(
        mockResponse({
          results: [
            { id: "v1", score: 0.99, metadata: { source: "doc1" } },
          ],
        }),
      );
      const results = await qortex.query({
        indexName: "test",
        queryVector: [1, 0, 0, 0],
        topK: 1,
      });
      expect(results[0].id).toBe("v1");

      // 5. Update
      callTool.mockResolvedValueOnce(
        mockResponse({ status: "updated", count: 1 }),
      );
      await qortex.updateVector({
        indexName: "test",
        id: "v1",
        update: { metadata: { reviewed: true } },
      });

      // 6. Delete single
      callTool.mockResolvedValueOnce(
        mockResponse({ status: "deleted", id: "v2" }),
      );
      await qortex.deleteVector({ indexName: "test", id: "v2" });

      // 7. Delete many
      callTool.mockResolvedValueOnce(
        mockResponse({ status: "deleted", count: 1 }),
      );
      await qortex.deleteVectors({
        indexName: "test",
        filter: { source: "doc3" },
      });

      // 8. List indexes
      callTool.mockResolvedValueOnce(
        mockResponse({ indexes: ["test"] }),
      );
      const indexes = await qortex.listIndexes();
      expect(indexes).toContain("test");

      // 9. Delete index
      callTool.mockResolvedValueOnce(
        mockResponse({ status: "deleted" }),
      );
      await qortex.deleteIndex({ indexName: "test" });

      expect(callTool).toHaveBeenCalledTimes(9);
    });
  });

  // -----------------------------------------------------------------------
  // Full graph-enhanced lifecycle (the qortex differentiator)
  // -----------------------------------------------------------------------

  describe("full graph-enhanced lifecycle", () => {
    it("textQuery → explore → rules → feedback → improved retrieval", async () => {
      // 1. Text query (graph-enhanced)
      callTool.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              id: "i-1",
              content: "OAuth2",
              score: 0.80,
              domain: "security",
              node_id: "sec:oauth",
              metadata: {},
            },
            {
              id: "i-2",
              content: "RBAC",
              score: 0.60,
              domain: "security",
              node_id: "sec:rbac",
              metadata: {},
            },
          ],
          query_id: "q-1",
          rules: [],
        }),
      );
      const r1 = await qortex.textQuery("authentication");
      expect(r1.items).toHaveLength(2);

      // 2. Explore top result
      callTool.mockResolvedValueOnce(
        mockResponse({
          node: {
            id: "sec:oauth",
            name: "OAuth2",
            description: "Auth framework",
            domain: "security",
            confidence: 1.0,
            properties: {},
          },
          edges: [
            {
              source_id: "sec:oauth",
              target_id: "sec:jwt",
              relation_type: "REQUIRES",
              confidence: 0.9,
              properties: {},
            },
          ],
          neighbors: [
            {
              id: "sec:jwt",
              name: "JWT",
              description: "Tokens",
              domain: "security",
              confidence: 1.0,
              properties: {},
            },
          ],
          rules: [
            {
              id: "rule:1",
              text: "Use OAuth2 for API access",
              domain: "security",
              category: "security",
              confidence: 1.0,
              relevance: 0.8,
              derivation: "explicit",
              source_concepts: ["sec:oauth"],
              metadata: {},
            },
          ],
        }),
      );
      const explored = await qortex.explore(r1.items[0].node_id);
      expect(explored!.edges[0].relation_type).toBe("REQUIRES");
      expect(explored!.rules).toHaveLength(1);

      // 3. Get rules
      callTool.mockResolvedValueOnce(
        mockResponse({
          rules: [
            {
              id: "rule:1",
              text: "Use OAuth2 for API access",
              domain: "security",
              category: "security",
              confidence: 1.0,
              relevance: 0.8,
              derivation: "explicit",
              source_concepts: ["sec:oauth"],
              metadata: {},
            },
          ],
          domain_count: 1,
          projection: "rules",
        }),
      );
      const rules = await qortex.getRules({
        conceptIds: r1.items.map((i) => i.node_id),
      });
      expect(rules.rules).toHaveLength(1);

      // 4. Feedback
      callTool.mockResolvedValueOnce(
        mockResponse({
          status: "recorded",
          query_id: "q-1",
          outcome_count: 2,
          source: "mastra",
        }),
      );
      await qortex.feedback(r1.query_id, {
        [r1.items[0].id]: "accepted",
        [r1.items[1].id]: "rejected",
      });

      // 5. Re-query (improved — accepted item should score higher)
      callTool.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              id: "i-1",
              content: "OAuth2",
              score: 0.92,
              domain: "security",
              node_id: "sec:oauth",
              metadata: {},
            },
          ],
          query_id: "q-2",
          rules: [],
        }),
      );
      const r2 = await qortex.textQuery("authentication");
      expect(r2.items[0].score).toBeGreaterThan(r1.items[0].score);

      expect(callTool).toHaveBeenCalledTimes(5);
    });
  });
});
