import { MintType, type Mint } from '../types.js'

export const KNOWN_MINTS: Omit<Mint, 'successfulOps' | 'failedOps' | 'createdAt'>[] = [
  {
    id: 'minibits',
    type: MintType.CASHU,
    name: 'Minibits',
    url: 'https://mint.minibits.cash/Bitcoin',
    inviteCode: null,
    federationId: null,
    trustScore: 85,
  },
  {
    id: 'coinos',
    type: MintType.CASHU,
    name: 'Coinos',
    url: 'https://cashu.coinos.io',
    inviteCode: null,
    federationId: null,
    trustScore: 80,
  },
  {
    id: 'bitcoin-principles',
    type: MintType.FEDIMINT,
    name: 'Bitcoin Principles',
    url: null,
    inviteCode: 'fed11qgqzxgthwden5te0v9cxjtnzd96xxmmfdckhqunfde3kjurvv4ejucm0d5hsqqfqkggx3jz0tvfv5n7lj0e7gs7nh47z06ry95x4963wfh8xlka7a80su3952t',
    federationId: null,
    trustScore: 90,
  },
]

export function findKnownMint(mintId: string): typeof KNOWN_MINTS[number] | null {
  return KNOWN_MINTS.find(m => m.id === mintId) ?? null
}

export function findKnownMintByUrl(url: string): typeof KNOWN_MINTS[number] | null {
  const normalized = url.replace(/\/$/, '').toLowerCase()
  return KNOWN_MINTS.find(m => {
    if (m.url) {
      return m.url.replace(/\/$/, '').toLowerCase() === normalized
    }
    return false
  }) ?? null
}

export function findKnownMintByInviteCode(inviteCode: string): typeof KNOWN_MINTS[number] | null {
  return KNOWN_MINTS.find(m => m.inviteCode === inviteCode) ?? null
}
