import express, { type Express, type Request, type Response } from 'express'
import { TOOL_DEFINITIONS } from '../tools/definitions.js'
import { executeTool } from '../tools/executor.js'
import { getOrchestrator } from '../services/orchestrator.js'
import { getDaemonState, isUnlocked } from '../state/machine.js'

export function createHttpServer(): Express {
  const app = express()

  app.use(express.json())

  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    next()
  })

  app.options('*', (_req, res) => {
    res.sendStatus(200)
  })

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      daemon_state: getDaemonState(),
      unlocked: isUnlocked(),
    })
  })

  app.get('/tools', (_req: Request, res: Response) => {
    res.json({
      tools: TOOL_DEFINITIONS.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
    })
  })

  app.post('/tools/:name', async (req: Request, res: Response) => {
    const { name } = req.params
    const params = req.body ?? {}

    const result = await executeTool(name, params)

    if (result.success) {
      res.json(result.data)
    } else {
      res.status(400).json({ error: result.error })
    }
  })

  app.get('/balance', async (_req: Request, res: Response) => {
    try {
      const orchestrator = getOrchestrator()
      const balance = orchestrator.getBalance()
      res.json(balance)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      res.status(500).json({ error: message })
    }
  })

  app.get('/mints', async (_req: Request, res: Response) => {
    try {
      const orchestrator = getOrchestrator()
      const mints = orchestrator.listMints()
      res.json({ mints })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      res.status(500).json({ error: message })
    }
  })

  app.post('/deposit', async (req: Request, res: Response) => {
    const result = await executeTool('deposit', req.body)
    if (result.success) {
      res.json(result.data)
    } else {
      res.status(400).json({ error: result.error })
    }
  })

  app.post('/pay', async (req: Request, res: Response) => {
    const result = await executeTool('pay', req.body)
    if (result.success) {
      res.json(result.data)
    } else {
      res.status(400).json({ error: result.error })
    }
  })

  app.post('/send', async (req: Request, res: Response) => {
    const result = await executeTool('send_ecash', req.body)
    if (result.success) {
      res.json(result.data)
    } else {
      res.status(400).json({ error: result.error })
    }
  })

  app.post('/receive', async (req: Request, res: Response) => {
    const result = await executeTool('receive_ecash', req.body)
    if (result.success) {
      res.json(result.data)
    } else {
      res.status(400).json({ error: result.error })
    }
  })

  return app
}

export async function startHttpServer(port: number, host: string): Promise<void> {
  const app = createHttpServer()

  return new Promise((resolve) => {
    app.listen(port, host, () => {
      console.log(`HTTP server listening on http://${host}:${port}`)
      resolve()
    })
  })
}
