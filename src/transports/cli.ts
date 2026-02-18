import { Command } from 'commander'
import { createInterface } from 'node:readline'
import { loadConfig } from '../config/loader.js'
import { initStorage, closeStorage } from '../storage/sqlite.js'
import { createSeed, unlockSeed, lockSeed, hasSeed } from '../state/seed.js'
import { getDaemonState } from '../state/machine.js'
import { initOrchestrator, getOrchestrator } from '../services/orchestrator.js'
import { executeTool } from '../tools/executor.js'
import { TOOL_DEFINITIONS } from '../tools/definitions.js'
import { createMint, getAllMints } from '../storage/mints.js'
import { KNOWN_MINTS } from '../config/known-mints.js'

async function promptPassword(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

export function createCli(): Command {
  const program = new Command()

  program
    .name('arkadecash-cli')
    .description('Arkade Cash CLI - Bitcoin payments via Arkade, Boltz, Lendasat, Cashu, and Fedimint')
    .version('0.1.0')

  program
    .command('init')
    .description('Initialize the daemon with a new seed or existing mnemonic')
    .option('-m, --mnemonic <words>', 'Use existing mnemonic phrase')
    .option('-c, --config <path>', 'Config file path')
    .action(async (options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      if (hasSeed()) {
        console.log('Already initialized. Use `arkadecash-cli unlock` to unlock.')
        process.exit(1)
      }

      const password = await promptPassword('Enter password to encrypt seed: ')
      const confirmPassword = await promptPassword('Confirm password: ')

      if (password !== confirmPassword) {
        console.error('Passwords do not match')
        process.exit(1)
      }

      const mnemonic = createSeed(password, options.mnemonic)

      console.log('\n=== BACKUP YOUR SEED PHRASE ===')
      console.log(mnemonic)
      console.log('================================\n')
      console.log('Daemon initialized and locked.')

      closeStorage()
    })

  program
    .command('unlock')
    .description('Unlock the daemon with password')
    .option('-c, --config <path>', 'Config file path')
    .action(async (options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const password = await promptPassword('Enter password: ')

      try {
        const mnemonic = unlockSeed(password)

        initOrchestrator(config.arkade, config.defaultSplitStrategy, config.boltz, config.lendasat, config.dbPath)
        await getOrchestrator().initialize(mnemonic)

        const mints = getAllMints()
        if (mints.length === 0) {
          console.log('Adding default mints...')
          for (const known of KNOWN_MINTS.slice(0, 2)) {
            createMint({
              type: known.type,
              name: known.name,
              url: known.url,
              inviteCode: known.inviteCode,
              federationId: known.federationId,
              trustScore: known.trustScore,
            })
          }
        }

        console.log('Daemon unlocked.')
      } catch (error) {
        console.error('Failed to unlock:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    })

  program
    .command('lock')
    .description('Lock the daemon')
    .option('-c, --config <path>', 'Config file path')
    .action(async (options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      lockSeed()
      console.log('Daemon locked.')

      closeStorage()
    })

  program
    .command('status')
    .description('Show daemon status')
    .option('-c, --config <path>', 'Config file path')
    .action(async (options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const state = getDaemonState()
      console.log(`Daemon state: ${state}`)

      if (state === 'UNLOCKED') {
        const mints = getAllMints()
        console.log(`Registered mints: ${mints.length}`)
      }

      closeStorage()
    })

  program
    .command('balance')
    .description('Show balances')
    .option('-c, --config <path>', 'Config file path')
    .action(async (options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('balance', {})
      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  program
    .command('mints')
    .description('List registered mints')
    .option('-c, --config <path>', 'Config file path')
    .action(async (options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('list_mints', {})
      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  program
    .command('deposit <amount>')
    .description('Create deposit invoice')
    .option('-m, --mint <id>', 'Specific mint ID')
    .option('-c, --config <path>', 'Config file path')
    .action(async (amount, options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('deposit', {
        amount_sats: parseInt(amount, 10),
        mint_id: options.mint,
      })

      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  program
    .command('pay <invoice>')
    .description('Pay Lightning invoice')
    .option('-m, --mint <id>', 'Specific mint to pay from')
    .option('-c, --config <path>', 'Config file path')
    .action(async (invoice, options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('pay', {
        invoice,
        mint_id: options.mint,
      })

      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  program
    .command('send <mint_id> <amount>')
    .description('Create ecash token')
    .option('-c, --config <path>', 'Config file path')
    .action(async (mintId, amount, options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('send_ecash', {
        mint_id: mintId,
        amount_sats: parseInt(amount, 10),
      })

      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  program
    .command('receive <token>')
    .description('Receive ecash token')
    .option('-m, --mint <id>', 'Mint ID (auto-detected if not provided)')
    .option('-c, --config <path>', 'Config file path')
    .action(async (token, options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('receive_ecash', {
        token,
        mint_id: options.mint,
      })

      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  program
    .command('add-mint')
    .description('Add a Cashu mint or Fedimint federation')
    .option('-t, --type <type>', 'Mint type (cashu or fedimint)', 'cashu')
    .option('-u, --url <url>', 'Cashu mint URL')
    .option('-i, --invite <code>', 'Fedimint invite code')
    .option('-n, --name <name>', 'Mint name')
    .option('-c, --config <path>', 'Config file path')
    .action(async (options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('add_mint', {
        type: options.type,
        url: options.url,
        invite_code: options.invite,
        name: options.name,
      })

      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  const lightning = program
    .command('lightning')
    .description('Lightning payment commands via Boltz swaps')

  lightning
    .command('send <invoice>')
    .description('Pay a Lightning invoice via Boltz submarine swap')
    .option('-c, --config <path>', 'Config file path')
    .action(async (invoice, options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('lightning_send', { invoice })
      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  lightning
    .command('receive <amount>')
    .description('Create a Lightning invoice via Boltz reverse swap')
    .option('-d, --description <desc>', 'Invoice description')
    .option('-c, --config <path>', 'Config file path')
    .action(async (amount, options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('lightning_receive', {
        amount_sats: parseInt(amount, 10),
        description: options.description,
      })

      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  lightning
    .command('fees')
    .description('Show Boltz swap fees and limits')
    .option('-c, --config <path>', 'Config file path')
    .action(async (options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('lightning_fees', {})
      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  const swap = program
    .command('swap')
    .description('BTC↔stablecoin swap commands via Lendasat')

  swap
    .command('quote <from> <to> <amount>')
    .description('Get a swap quote')
    .option('-c, --config <path>', 'Config file path')
    .action(async (from, to, amount, options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('swap_quote', {
        from,
        to,
        amount: parseInt(amount, 10),
      })

      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  swap
    .command('create <target_address> <target_amount> <target_token>')
    .description('Create a BTC→stablecoin swap')
    .option('-n, --network <network>', 'Target network', 'polygon')
    .option('-c, --config <path>', 'Config file path')
    .action(async (targetAddress, targetAmount, targetToken, options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('swap_create', {
        target_address: targetAddress,
        target_amount: targetAmount,
        target_token: targetToken,
        network: options.network,
      })

      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  swap
    .command('status <swap_id>')
    .description('Check swap status')
    .option('-c, --config <path>', 'Config file path')
    .action(async (swapId, options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('swap_status', { swap_id: swapId })
      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  swap
    .command('list')
    .description('List all swaps')
    .option('-c, --config <path>', 'Config file path')
    .action(async (options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('swap_list', {})
      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  swap
    .command('claim <swap_id>')
    .description('Claim a completed swap')
    .option('-c, --config <path>', 'Config file path')
    .action(async (swapId, options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('swap_claim', { swap_id: swapId })
      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  swap
    .command('pairs')
    .description('List supported trading pairs')
    .option('-c, --config <path>', 'Config file path')
    .action(async (options) => {
      const config = loadConfig(options.config)
      initStorage(config.dbPath!)

      const result = await executeTool('swap_pairs', {})
      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2))
      } else {
        console.error('Error:', result.error)
      }

      closeStorage()
    })

  program
    .command('tools')
    .description('List available tools')
    .action(() => {
      for (const tool of TOOL_DEFINITIONS) {
        console.log(`${tool.name}: ${tool.description}`)
      }
    })

  return program
}

export async function runCli(): Promise<void> {
  const program = createCli()
  await program.parseAsync(process.argv)
}
