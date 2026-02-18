import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { TOOL_DEFINITIONS } from '../tools/definitions.js'
import { executeTool } from '../tools/executor.js'

export function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'private-payments',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOL_DEFINITIONS.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    const result = await executeTool(name, args ?? {})

    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${result.error}`,
        },
      ],
      isError: true,
    }
  })

  return server
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer()
  const transport = new StdioServerTransport()

  await server.connect(transport)

  console.error('MCP server started on stdio')
}
