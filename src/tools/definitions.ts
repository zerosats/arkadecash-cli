import type { ToolDefinition } from '../types.js'

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'deposit',
    description: 'Receive Bitcoin via Arkade and split to private Cashu/Fedimint mints. Creates a Lightning invoice.',
    inputSchema: {
      type: 'object',
      properties: {
        amount_sats: {
          type: 'number',
          description: 'Amount in satoshis to deposit',
        },
        mint_id: {
          type: 'string',
          description: 'Optional specific mint to deposit to',
        },
        split_strategy: {
          type: 'string',
          enum: ['equal', 'weighted', 'random', 'single'],
          description: 'How to distribute funds across mints',
        },
      },
      required: ['amount_sats'],
    },
  },
  {
    name: 'deposit_from_arkade',
    description: 'Move funds from Arkade wallet to a private mint (Cashu/Fedimint)',
    inputSchema: {
      type: 'object',
      properties: {
        amount_sats: {
          type: 'number',
          description: 'Amount in satoshis to move from Arkade',
        },
        mint_id: {
          type: 'string',
          description: 'Optional specific mint to deposit to',
        },
      },
      required: ['amount_sats'],
    },
  },
  {
    name: 'pay',
    description: 'Pay a Lightning invoice from a private mint',
    inputSchema: {
      type: 'object',
      properties: {
        invoice: {
          type: 'string',
          description: 'BOLT11 Lightning invoice to pay',
        },
        mint_id: {
          type: 'string',
          description: 'Optional specific mint to pay from',
        },
      },
      required: ['invoice'],
    },
  },
  {
    name: 'balance',
    description: 'Get aggregate balance across all wallets and mints',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'distribute',
    description: 'Move funds between mints for privacy or rebalancing',
    inputSchema: {
      type: 'object',
      properties: {
        from_mint: {
          type: 'string',
          description: 'Source mint ID',
        },
        to_mint: {
          type: 'string',
          description: 'Destination mint ID',
        },
        amount_sats: {
          type: 'number',
          description: 'Amount in satoshis to transfer',
        },
      },
      required: ['from_mint', 'to_mint', 'amount_sats'],
    },
  },
  {
    name: 'send_ecash',
    description: 'Generate a bearer ecash token for offline transfer',
    inputSchema: {
      type: 'object',
      properties: {
        mint_id: {
          type: 'string',
          description: 'Mint to create token from',
        },
        amount_sats: {
          type: 'number',
          description: 'Amount in satoshis',
        },
      },
      required: ['mint_id', 'amount_sats'],
    },
  },
  {
    name: 'receive_ecash',
    description: 'Redeem a bearer ecash token',
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Cashu or Fedimint token to redeem',
        },
        mint_id: {
          type: 'string',
          description: 'Optional mint ID (auto-detected from token if not provided)',
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'list_mints',
    description: 'List all registered mints with their balances',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'add_mint',
    description: 'Register a new Cashu mint or Fedimint federation',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['cashu', 'fedimint'],
          description: 'Type of mint',
        },
        url: {
          type: 'string',
          description: 'Cashu mint URL',
        },
        invite_code: {
          type: 'string',
          description: 'Fedimint invite code',
        },
        name: {
          type: 'string',
          description: 'Human-readable name for the mint',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'arkade_send',
    description: 'Send Bitcoin to an Arkade address (ark1...)',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Arkade address (ark1...)' },
        amount_sats: { type: 'number', description: 'Amount in satoshis' },
      },
      required: ['address', 'amount_sats'],
    },
  },
  {
    name: 'arkade_balance',
    description: 'Get Arkade wallet balance (non-private Bitcoin)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'arkade_address',
    description: 'Get Arkade deposit address for receiving Bitcoin',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'lightning_send',
    description: 'Pay a Lightning invoice via Boltz submarine swap (Arkade → Lightning)',
    inputSchema: {
      type: 'object',
      properties: {
        invoice: {
          type: 'string',
          description: 'BOLT11 Lightning invoice to pay',
        },
      },
      required: ['invoice'],
    },
  },
  {
    name: 'lightning_receive',
    description: 'Create a Lightning invoice via Boltz reverse swap (Lightning → Arkade)',
    inputSchema: {
      type: 'object',
      properties: {
        amount_sats: {
          type: 'number',
          description: 'Amount in satoshis (minimum 400)',
        },
        description: {
          type: 'string',
          description: 'Invoice description',
        },
      },
      required: ['amount_sats'],
    },
  },
  {
    name: 'lightning_fees',
    description: 'Get current Boltz swap fee structure for Lightning payments',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'swap_quote',
    description: 'Get a Lendasat quote for BTC↔stablecoin swap',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Source token ID (e.g. btc_arkade, usdc_pol)',
        },
        to: {
          type: 'string',
          description: 'Target token ID (e.g. usdc_pol, btc_arkade)',
        },
        amount: {
          type: 'number',
          description: 'Amount in smallest unit of source token',
        },
      },
      required: ['from', 'to', 'amount'],
    },
  },
  {
    name: 'swap_create',
    description: 'Create a BTC→stablecoin swap via Lendasat',
    inputSchema: {
      type: 'object',
      properties: {
        target_address: {
          type: 'string',
          description: 'Destination address (e.g. Polygon address for USDC)',
        },
        target_amount: {
          type: 'string',
          description: 'Amount of target token to receive',
        },
        target_token: {
          type: 'string',
          description: 'Target token ID (e.g. usdc_pol)',
        },
        network: {
          type: 'string',
          description: 'Target network (e.g. polygon)',
          default: 'polygon',
        },
      },
      required: ['target_address', 'target_amount', 'target_token'],
    },
  },
  {
    name: 'swap_status',
    description: 'Check the status of a Lendasat swap',
    inputSchema: {
      type: 'object',
      properties: {
        swap_id: {
          type: 'string',
          description: 'Swap ID to check',
        },
      },
      required: ['swap_id'],
    },
  },
  {
    name: 'swap_list',
    description: 'List all Lendasat swaps',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'swap_claim',
    description: 'Claim a completed Lendasat swap',
    inputSchema: {
      type: 'object',
      properties: {
        swap_id: {
          type: 'string',
          description: 'Swap ID to claim',
        },
      },
      required: ['swap_id'],
    },
  },
  {
    name: 'swap_pairs',
    description: 'List supported Lendasat trading pairs',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
]

export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find(t => t.name === name)
}
