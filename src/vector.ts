/**
 * QortexVector — MastraVector backed by qortex's knowledge graph.
 *
 * Implements all 9 MastraVector abstract methods via MCP tool calls
 * to the qortex server. Adds graph-enhanced extras: explore(), rules(),
 * feedback(), and text-level query().
 *
 * Usage:
 *   const qortex = new QortexVector({ id: "qortex" });
 *   await qortex.createIndex({ indexName: "docs", dimension: 384 });
 *   await qortex.upsert({ indexName: "docs", vectors: [...], metadata: [...] });
 *   const results = await qortex.query({ indexName: "docs", queryVector: [...] });
 *
 * Graph extras:
 *   const explored = await qortex.explore(results[0].id);
 *   const rules = await qortex.getRules({ domains: ["security"] });
 *   await qortex.feedback(queryId, { [itemId]: "accepted" });
 */

import { MastraVector } from "@mastra/core/vector";
import type {
  QueryResult,
  IndexStats,
  CreateIndexParams,
  UpsertVectorParams,
  QueryVectorParams,
  DescribeIndexParams,
  DeleteIndexParams,
  UpdateVectorParams,
  DeleteVectorParams,
  DeleteVectorsParams,
} from "@mastra/core/vector";
import type { VectorFilter } from "@mastra/core/vector";
import { QortexMcpClient, type QortexMcpClientConfig } from "./client.js";
import type {
  ExploreResult,
  RulesResult,
  FeedbackOutcome,
  FeedbackResult,
  QortexQueryResult,
} from "./types.js";

export interface QortexVectorConfig extends QortexMcpClientConfig {
  /** Unique identifier for this vector store instance. */
  id: string;
}

export class QortexVector extends MastraVector {
  private mcp: QortexMcpClient;

  constructor(config: QortexVectorConfig) {
    super({ id: config.id });
    this.mcp = new QortexMcpClient(config);
  }

  /** Ensure the MCP connection is established. */
  async connect(): Promise<void> {
    await this.mcp.connect();
  }

  /** Disconnect from the MCP server. */
  async disconnect(): Promise<void> {
    await this.mcp.disconnect();
  }

  // ---------------------------------------------------------------------------
  // MastraVector abstract methods (9 required)
  // ---------------------------------------------------------------------------

  async createIndex({
    indexName,
    dimension,
    metric = "cosine",
  }: CreateIndexParams): Promise<void> {
    const result = (await this.mcp.callTool("qortex_vector_create_index", {
      index_name: indexName,
      dimension,
      metric,
    })) as Record<string, unknown>;

    if (result.error) {
      throw new Error(result.error as string);
    }
  }

  async listIndexes(): Promise<string[]> {
    const result = (await this.mcp.callTool(
      "qortex_vector_list_indexes",
      {},
    )) as { indexes: string[] };
    return result.indexes;
  }

  async describeIndex({ indexName }: DescribeIndexParams): Promise<IndexStats> {
    const result = (await this.mcp.callTool(
      "qortex_vector_describe_index",
      {
        index_name: indexName,
      },
    )) as Record<string, unknown>;

    if (result.error) {
      throw new Error(result.error as string);
    }

    return {
      dimension: result.dimension as number,
      count: result.count as number,
      metric: result.metric as "cosine" | "euclidean" | "dotproduct",
    };
  }

  async deleteIndex({ indexName }: DeleteIndexParams): Promise<void> {
    const result = (await this.mcp.callTool("qortex_vector_delete_index", {
      index_name: indexName,
    })) as Record<string, unknown>;

    if (result.error) {
      throw new Error(result.error as string);
    }
  }

  async upsert({
    indexName,
    vectors,
    metadata,
    ids,
  }: UpsertVectorParams): Promise<string[]> {
    const result = (await this.mcp.callTool("qortex_vector_upsert", {
      index_name: indexName,
      vectors,
      metadata: metadata ?? undefined,
      ids: ids ?? undefined,
    })) as Record<string, unknown>;

    if (result.error) {
      throw new Error(result.error as string);
    }

    return result.ids as string[];
  }

  async query({
    indexName,
    queryVector,
    topK = 10,
    filter,
    includeVector = false,
  }: QueryVectorParams): Promise<QueryResult[]> {
    const result = (await this.mcp.callTool("qortex_vector_query", {
      index_name: indexName,
      query_vector: queryVector,
      top_k: topK,
      filter: filter ?? undefined,
      include_vector: includeVector,
    })) as { results?: QueryResult[]; error?: string };

    if (result.error) {
      throw new Error(result.error);
    }

    return result.results ?? [];
  }

  async updateVector({
    indexName,
    id,
    filter,
    update,
  }: UpdateVectorParams): Promise<void> {
    const result = (await this.mcp.callTool("qortex_vector_update", {
      index_name: indexName,
      id: id ?? undefined,
      filter: filter ?? undefined,
      vector: update.vector ?? undefined,
      metadata: update.metadata ?? undefined,
    })) as Record<string, unknown>;

    if (result.error) {
      throw new Error(result.error as string);
    }
  }

  async deleteVector({ indexName, id }: DeleteVectorParams): Promise<void> {
    const result = (await this.mcp.callTool("qortex_vector_delete", {
      index_name: indexName,
      id,
    })) as Record<string, unknown>;

    if (result.error) {
      throw new Error(result.error as string);
    }
  }

  async deleteVectors({
    indexName,
    ids,
    filter,
  }: DeleteVectorsParams): Promise<void> {
    const result = (await this.mcp.callTool("qortex_vector_delete_many", {
      index_name: indexName,
      ids: ids ?? undefined,
      filter: filter ?? undefined,
    })) as Record<string, unknown>;

    if (result.error) {
      throw new Error(result.error as string);
    }
  }

  // ---------------------------------------------------------------------------
  // Qortex extras — graph-enhanced capabilities
  // ---------------------------------------------------------------------------

  /**
   * Text-level query using qortex's full retrieval pipeline.
   *
   * Unlike the vector-level `query()` (which takes raw embeddings),
   * this uses qortex's embedding model + optional graph-enhanced PPR.
   * Returns concepts with scores, rules, and graph node IDs.
   */
  async textQuery(
    context: string,
    options: {
      domains?: string[];
      topK?: number;
      minConfidence?: number;
      mode?: "vec" | "graph" | "auto";
    } = {},
  ): Promise<QortexQueryResult> {
    const result = (await this.mcp.callTool("qortex_query", {
      context,
      domains: options.domains ?? undefined,
      top_k: options.topK ?? 20,
      min_confidence: options.minConfidence ?? 0.0,
      mode: options.mode ?? "auto",
    })) as QortexQueryResult;

    return result;
  }

  /**
   * Explore a node's neighborhood in the knowledge graph.
   *
   * Use node_id from textQuery() results to navigate the graph.
   * Returns typed edges, neighbor nodes, and linked rules.
   */
  async explore(
    nodeId: string,
    depth: number = 1,
  ): Promise<ExploreResult | null> {
    const result = (await this.mcp.callTool("qortex_explore", {
      node_id: nodeId,
      depth,
    })) as ExploreResult & { node: unknown };

    if (result.node === null) {
      return null;
    }

    return result;
  }

  /**
   * Get projected rules from the knowledge graph.
   *
   * Rules are explicit constraints, patterns, and guidelines linked
   * to concepts. They're auto-surfaced in textQuery() results but
   * can also be queried directly.
   */
  async getRules(options: {
    domains?: string[];
    conceptIds?: string[];
    categories?: string[];
    includeDerived?: boolean;
    minConfidence?: number;
  } = {}): Promise<RulesResult> {
    const result = (await this.mcp.callTool("qortex_rules", {
      domains: options.domains ?? undefined,
      concept_ids: options.conceptIds ?? undefined,
      categories: options.categories ?? undefined,
      include_derived: options.includeDerived ?? true,
      min_confidence: options.minConfidence ?? 0.0,
    })) as RulesResult;

    return result;
  }

  /**
   * Report outcomes for retrieved items to improve future retrieval.
   *
   * This is the feedback loop that makes qortex learn. Accepted items
   * get higher PPR teleportation probability; rejected items get lower.
   */
  async feedback(
    queryId: string,
    outcomes: Record<string, FeedbackOutcome>,
    source: string = "mastra",
  ): Promise<FeedbackResult> {
    const result = (await this.mcp.callTool("qortex_feedback", {
      query_id: queryId,
      outcomes,
      source,
    })) as FeedbackResult;

    return result;
  }
}
