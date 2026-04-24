import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HaravanMcpConfig } from '../utils/config';
import { allTools, filterTools, filterToolsByAccess, inferToolAccess } from '../mcp-tool/registry';
import { resolveToolFilter } from '../mcp-tool/presets';
import { composeMiddleware } from '../mcp-tool/middleware/chain';
import { errorHandlerMiddleware } from '../mcp-tool/middleware/error-handler';
import { rateLimiterMiddleware } from '../mcp-tool/middleware/rate-limiter';
import { paginationMiddleware } from '../mcp-tool/middleware/pagination';
import { validationMiddleware } from '../mcp-tool/middleware/validation';
import { haravanApiHandler } from '../mcp-tool/handler';
import { McpTool, MiddlewareContext, MiddlewareFn } from '../mcp-tool/types';
import { logger } from '../utils/logger';

// Read version from package.json at build time
const VERSION = require('../../package.json').version as string;

export interface InitResult {
  mcpServer: McpServer;
  toolCount: number;
  /** Factory to create new server instances (for multi-session HTTP transport). */
  createServer: (overrides?: Partial<HaravanMcpConfig>) => McpServer;
}

/**
 * Initialize the Haravan MCP Server with configured tools and middleware.
 */
export function initHaravanMcpServer(config: HaravanMcpConfig): InitResult {
  const mcpServer = new McpServer(
    {
      name: 'haravan-mcp',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Resolve tool filter
  const toolFilter = config.tools
    ? config.tools
    : resolveToolFilter('preset.default');

  // Filter tools by configured preset/project/name, then by client access.
  // HTTP sessions can pass X-Haravan-MCP-Access: read|write.
  const configuredTools = filterTools(allTools, toolFilter);
  const enabledTools = filterToolsByAccess(configuredTools, config.clientAccess);

  logger.info(
    `Registering ${enabledTools.length}/${allTools.length} tools (configured=${configuredTools.length}, access=${config.clientAccess || 'read'})`
  );

  // Build middleware chain
  const middlewares: MiddlewareFn[] = [
    errorHandlerMiddleware,
    validationMiddleware,
    rateLimiterMiddleware,
    paginationMiddleware,
  ];

  // Register each tool
  for (const tool of enabledTools) {
    registerTool(mcpServer, tool, middlewares, config);
  }

  // Factory for multi-session transports (HTTP/SSE)
  const createServer = (overrides?: Partial<HaravanMcpConfig>): McpServer => {
    const effectiveConfig = { ...config, ...overrides };
    const newServer = new McpServer(
      { name: 'haravan-mcp', version: VERSION },
      { capabilities: { tools: {} } }
    );
    const sessionTools = filterToolsByAccess(configuredTools, effectiveConfig.clientAccess);
    for (const tool of sessionTools) {
      registerTool(newServer, tool, middlewares, effectiveConfig);
    }
    return newServer;
  };

  return { mcpServer, toolCount: enabledTools.length, createServer };
}

function registerTool(
  server: McpServer,
  tool: McpTool,
  middlewares: MiddlewareFn[],
  config: HaravanMcpConfig
) {
  // Use the raw shape properties for the MCP tool
  const schemaShape = tool.schema.shape;

  // Build the handler with middleware chain
  const handler = tool.customHandler || haravanApiHandler;
  const composedHandler = composeMiddleware(middlewares, handler);

  server.tool(
    tool.name,
    tool.description,
    schemaShape,
    async (params: any, _extra: any) => {
      const clientAccess = config.clientAccess || 'read';
      if (inferToolAccess(tool) === 'write' && clientAccess !== 'write') {
        return {
          content: [
            {
              type: 'text',
              text: `Tool ${tool.name} requires write access. Start the HTTP MCP session with X-Haravan-MCP-Access: write.`,
            },
          ],
          isError: true,
        } as any;
      }

      const ctx: MiddlewareContext = {
        tool,
        params: { ...params },
        accessToken: config.accessToken || '',
        domain: config.domain,
        webhookDomain: config.webhookDomain,
        meta: { clientAccess },
      };

      const result = await composedHandler(ctx);
      return {
        content: result.content,
        isError: result.isError,
      } as any;
    }
  );

  logger.debug(`Registered tool: ${tool.name}`);
}
