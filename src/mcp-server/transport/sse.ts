import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express from 'express';
import { logger } from '../../utils/logger';
import { HaravanMcpConfig } from '../../utils/config';

/**
 * Start MCP server with Streamable HTTP transport.
 * Each session gets its own transport and server instance.
 */
export async function startHttpTransport(
  createServer: (overrides?: Partial<HaravanMcpConfig>) => McpServer,
  port: number,
  serverApiKey?: string
): Promise<void> {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, {
    transport: StreamableHTTPServerTransport;
    server: McpServer;
    haravanToken: string;
  }>();

  function getBearerToken(authHeader?: string | string[]): string | undefined {
    if (!authHeader || Array.isArray(authHeader)) return undefined;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match?.[1];
  }

  function requireServerAuth(req: express.Request, res: express.Response): boolean {
    if (!serverApiKey) return true;
    const incoming = getBearerToken(req.headers.authorization);
    if (incoming !== serverApiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  app.post('/mcp', async (req, res) => {
    if (!requireServerAuth(req, res)) return;

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;

      // Many MCP clients re-send custom headers on every request.
      // Accept repeated X-Haravan-Access-Token if it matches the token already bound to this session.
      // Reject only when the client attempts to switch to a different token mid-session.
      const tokenOnExistingSessionHeader = req.headers['x-haravan-access-token'];
      const tokenOnExistingSession =
        typeof tokenOnExistingSessionHeader === 'string'
          ? tokenOnExistingSessionHeader.trim()
          : undefined;

      if (
        tokenOnExistingSession &&
        tokenOnExistingSession !== session.haravanToken
      ) {
        res.status(400).json({
          error: 'Session already initialized with a different Haravan token. Open a new MCP session to change token.',
        });
        return;
      }

      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    const haravanTokenHeader = req.headers['x-haravan-access-token'];
    const haravanToken =
      typeof haravanTokenHeader === 'string' ? haravanTokenHeader.trim() : undefined;

    if (!haravanToken) {
      res.status(401).json({
        error: 'Missing X-Haravan-Access-Token header for new session.',
      });
      return;
    }

    // New session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    const server = createServer({ accessToken: haravanToken });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    // Store session AFTER handleRequest (sessionId is now set in response headers)
    const newSessionId = res.getHeader('mcp-session-id') as string;
    if (newSessionId) {
      sessions.set(newSessionId, {
        transport,
        server,
        haravanToken,
      });
      logger.info(`New HTTP session: ${newSessionId}`);
    }

    // Cleanup on close
    transport.onclose = () => {
      if (newSessionId) sessions.delete(newSessionId);
      logger.info(`HTTP session closed: ${newSessionId}`);
    };
  });

  app.get('/mcp', async (req, res) => {
    if (!requireServerAuth(req, res)) return;

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }
    res.status(400).json({ error: 'No session. Send POST /mcp first.' });
  });

  app.delete('/mcp', async (req, res) => {
    if (!requireServerAuth(req, res)) return;

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      sessions.delete(sessionId);
      return;
    }
    res.status(400).json({ error: 'Unknown session.' });
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      auth: serverApiKey ? 'protected' : 'open',
      tokenMode: 'client-header-per-session',
    });
  });

  app.listen(port, () => {
    logger.info(`Haravan MCP server started (HTTP streamable transport on port ${port})`);
    if (serverApiKey) {
      logger.info('HTTP auth enabled via Authorization: Bearer <MCP_SERVER_API_KEY>');
    } else {
      logger.warn('HTTP auth is DISABLED. Public deployment without MCP_SERVER_API_KEY is unsafe.');
    }
    logger.info('Clients must send X-Haravan-Access-Token on the first POST /mcp request of each session.');
  });
}
