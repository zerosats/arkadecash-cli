import { getOrchestrator } from '../services/orchestrator.js'
import { getArkadeService } from '../services/arkade.js'
import { getCashuService } from '../services/cashu.js'
import { getFedimintService } from '../services/fedimint.js'
import { requireUnlocked } from '../state/machine.js'
import { type ToolResult, type SplitStrategy } from '../types.js'

interface DepositParams {
  amount_sats: number
  mint_id?: string
  split_strategy?: string
}

interface DepositFromArkadeParams {
  amount_sats: number
  mint_id?: string
}

interface PayParams {
  invoice: string
  mint_id?: string
}

interface DistributeParams {
  from_mint: string
  to_mint: string
  amount_sats: number
}

interface SendEcashParams {
  mint_id: string
  amount_sats: number
}

interface ReceiveEcashParams {
  token: string
  mint_id?: string
}

interface AddMintParams {
  type: 'cashu' | 'fedimint'
  url?: string
  invite_code?: string
  name?: string
}

interface ArkadeSendParams {
  address: string
  amount_sats: number
}

interface LightningSendParams {
  invoice: string
}

interface LightningReceiveParams {
  amount_sats: number
  description?: string
}

interface SwapQuoteParams {
  from: string
  to: string
  amount: number
}

interface SwapCreateParams {
  target_address: string
  target_amount: string
  target_token: string
  network?: string
}

interface SwapStatusParams {
  swap_id: string
}

interface SwapClaimParams {
  swap_id: string
}

export async function executeTool(
  name: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    requireUnlocked()

    switch (name) {
      case 'deposit':
        return await executeDeposit(params as unknown as DepositParams)

      case 'deposit_from_arkade':
        return await executeDepositFromArkade(params as unknown as DepositFromArkadeParams)

      case 'pay':
        return await executePay(params as unknown as PayParams)

      case 'balance':
        return executeBalance()

      case 'distribute':
        return await executeDistribute(params as unknown as DistributeParams)

      case 'send_ecash':
        return await executeSendEcash(params as unknown as SendEcashParams)

      case 'receive_ecash':
        return await executeReceiveEcash(params as unknown as ReceiveEcashParams)

      case 'list_mints':
        return executeListMints()

      case 'add_mint':
        return await executeAddMint(params as unknown as AddMintParams)

      case 'arkade_send':
        return await executeArkadeSend(params as unknown as ArkadeSendParams)

      case 'arkade_balance':
        return await executeArkadeBalance()

      case 'arkade_address':
        return await executeArkadeAddress()

      case 'lightning_send':
        return await executeLightningSend(params as unknown as LightningSendParams)

      case 'lightning_receive':
        return await executeLightningReceive(params as unknown as LightningReceiveParams)

      case 'lightning_fees':
        return await executeLightningFees()

      case 'swap_quote':
        return await executeSwapQuote(params as unknown as SwapQuoteParams)

      case 'swap_create':
        return await executeSwapCreate(params as unknown as SwapCreateParams)

      case 'swap_status':
        return await executeSwapStatus(params as unknown as SwapStatusParams)

      case 'swap_list':
        return await executeSwapList()

      case 'swap_claim':
        return await executeSwapClaim(params as unknown as SwapClaimParams)

      case 'swap_pairs':
        return await executeSwapPairs()

      default:
        return { success: false, error: `Unknown tool: ${name}` }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

async function executeDeposit(params: DepositParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()

  const strategy: SplitStrategy | undefined = params.split_strategy
    ? { type: params.split_strategy as SplitStrategy['type'] }
    : undefined

  const result = await orchestrator.deposit(params.amount_sats, params.mint_id, strategy)

  return {
    success: true,
    data: {
      invoice: result.invoice,
      amount_sats: result.amountSats,
      quote_id: result.quoteId,
      mint_id: result.mintId,
      message: 'Pay this Lightning invoice to deposit funds',
    },
  }
}

async function executeDepositFromArkade(params: DepositFromArkadeParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()

  const result = await orchestrator.depositFromArkade(params.amount_sats, params.mint_id)

  return {
    success: true,
    data: {
      amount_sats: result.amountSats,
      mint_id: result.mintId,
      message: 'Funds moved from Arkade to private mint',
    },
  }
}

async function executePay(params: PayParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()

  const result = await orchestrator.pay(params.invoice, params.mint_id)

  return {
    success: true,
    data: {
      amount_sats: result.amountSats,
      fee_sats: result.feeSats,
      mint_id: result.mintId,
      preimage: result.preimage,
    },
  }
}

function executeBalance(): ToolResult {
  const orchestrator = getOrchestrator()
  const balance = orchestrator.getBalance()

  return {
    success: true,
    data: {
      total_sats: balance.totalSats,
      arkade_sats: balance.arkadeSats,
      private_sats: balance.privateSats,
      by_mint: balance.byMint,
    },
  }
}

async function executeDistribute(params: DistributeParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()

  const result = await orchestrator.distribute(
    params.from_mint,
    params.to_mint,
    params.amount_sats
  )

  return {
    success: true,
    data: {
      amount_sats: result.amountSats,
      from_mint: result.fromMint,
      to_mint: result.toMint,
      message: 'Funds redistributed between mints',
    },
  }
}

async function executeSendEcash(params: SendEcashParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()

  const result = await orchestrator.sendEcash(params.mint_id, params.amount_sats)

  return {
    success: true,
    data: {
      token: result.token,
      amount_sats: result.amountSats,
      mint_id: result.mintId,
      message: 'Bearer token created. Share this to transfer funds offline.',
    },
  }
}

async function executeReceiveEcash(params: ReceiveEcashParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()

  const result = await orchestrator.receiveEcash(params.token, params.mint_id)

  return {
    success: true,
    data: {
      amount_sats: result.amountSats,
      mint_id: result.mintId,
      message: 'Token redeemed successfully',
    },
  }
}

function executeListMints(): ToolResult {
  const orchestrator = getOrchestrator()
  const mints = orchestrator.listMints()

  return {
    success: true,
    data: {
      mints: mints.map(m => ({
        id: m.id,
        type: m.type,
        name: m.name,
        url: m.url,
        balance_sats: m.balanceSats,
        trust_score: m.trustScore,
      })),
    },
  }
}

async function executeAddMint(params: AddMintParams): Promise<ToolResult> {
  if (params.type === 'cashu') {
    if (!params.url) {
      return { success: false, error: 'Cashu mint requires a URL' }
    }

    const cashu = getCashuService()
    const mint = await cashu.ensureMint(params.url, params.name)
    await cashu.initializeWallet(mint.id)

    return {
      success: true,
      data: {
        mint_id: mint.id,
        name: mint.name,
        type: 'cashu',
        url: mint.url,
      },
    }
  }

  if (params.type === 'fedimint') {
    if (!params.invite_code) {
      return { success: false, error: 'Fedimint requires an invite code' }
    }

    const fedimint = getFedimintService()
    const mint = await fedimint.ensureFederation(params.invite_code, params.name)
    await fedimint.initializeFederation(mint.id)

    return {
      success: true,
      data: {
        mint_id: mint.id,
        name: mint.name,
        type: 'fedimint',
        federation_id: mint.federationId,
      },
    }
  }

  return { success: false, error: 'Invalid mint type' }
}

async function executeArkadeSend(params: ArkadeSendParams): Promise<ToolResult> {
  const arkade = getArkadeService()
  const txid = await arkade.sendBitcoin(params.address, params.amount_sats)

  return {
    success: true,
    data: {
      txid,
      address: params.address,
      amount_sats: params.amount_sats,
    },
  }
}

async function executeArkadeBalance(): Promise<ToolResult> {
  const arkade = getArkadeService()
  const balance = await arkade.getBalance()

  return {
    success: true,
    data: {
      balance_sats: Number(balance),
    },
  }
}

async function executeArkadeAddress(): Promise<ToolResult> {
  const arkade = getArkadeService()
  const address = await arkade.getBoardingAddress()

  return {
    success: true,
    data: {
      address,
      message: 'Send Bitcoin to this address to deposit into Arkade',
    },
  }
}

async function executeLightningSend(params: LightningSendParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()
  const result = await orchestrator.sendLightningPayment(params.invoice)

  return {
    success: true,
    data: {
      amount_sats: result.amountSats,
      preimage: result.preimage,
      fee_sats: result.feeSats,
    },
  }
}

async function executeLightningReceive(params: LightningReceiveParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()
  const result = await orchestrator.createLightningInvoice(params.amount_sats, params.description)

  return {
    success: true,
    data: {
      invoice: result.invoice,
      amount_sats: params.amount_sats,
      message: 'Lightning invoice created. Payment will be claimed automatically.',
    },
  }
}

async function executeLightningFees(): Promise<ToolResult> {
  const orchestrator = getOrchestrator()
  const fees = await orchestrator.getLightningFees()
  const limits = await orchestrator.getLightningLimits()

  return {
    success: true,
    data: {
      miner_fees_sats: fees.minerFees,
      percentage: fees.percentage,
      min_amount_sats: limits.minSats,
      max_amount_sats: limits.maxSats,
    },
  }
}

async function executeSwapQuote(params: SwapQuoteParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()
  const quote = await orchestrator.getSwapQuote(params.from, params.to, BigInt(params.amount))

  return {
    success: true,
    data: {
      exchange_rate: quote.exchange_rate,
      protocol_fee: quote.protocol_fee,
      network_fee: quote.network_fee,
      min_amount: quote.min_amount,
    },
  }
}

async function executeSwapCreate(params: SwapCreateParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()
  const result = await orchestrator.createSwap(
    params.target_address,
    params.target_amount,
    params.target_token,
    params.network ?? 'polygon',
  )

  return {
    success: true,
    data: {
      swap_id: result.id ?? result.swap_id,
      status: result.status,
      htlc_address: result.htlc_address_arkade,
      amount_sats: result.sats_receive ?? result.source_amount,
    },
  }
}

async function executeSwapStatus(params: SwapStatusParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()
  const swap = await orchestrator.getSwapStatus(params.swap_id)

  return {
    success: true,
    data: swap,
  }
}

async function executeSwapList(): Promise<ToolResult> {
  const orchestrator = getOrchestrator()
  const swaps = await orchestrator.listSwaps()

  return {
    success: true,
    data: { swaps },
  }
}

async function executeSwapClaim(params: SwapClaimParams): Promise<ToolResult> {
  const orchestrator = getOrchestrator()
  await orchestrator.claimSwap(params.swap_id)

  return {
    success: true,
    data: {
      swap_id: params.swap_id,
      message: 'Swap claimed successfully',
    },
  }
}

async function executeSwapPairs(): Promise<ToolResult> {
  const orchestrator = getOrchestrator()
  const pairs = await orchestrator.getSupportedPairs()

  return {
    success: true,
    data: { pairs },
  }
}
