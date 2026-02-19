# arkadecash

Unified Bitcoin payments for AI agents. Manages funds across Arkade, Cashu, Fedimint, Boltz (Lightning), and Lendasat (BTC↔stablecoin swaps). Ships as both a CLI and an MCP server for agent tool-use.

## Prerequisites

- Node.js >= 20
- npm

> **Note**: This is a Node.js/TypeScript project. It does NOT use Rust/Cargo.

## Install

```bash
git clone https://github.com/zerosats/arkadecash-cli.git
  cd arkadecash-cli
  npm install
  npm run build
```

## Quick Start

```bash
# Initialize with a new seed
arkadecash init

# Unlock the daemon
arkadecash unlock

# Check balances
arkadecash balance

# List registered mints
arkadecash mints
```

## CLI Commands

### Wallet Management

```bash
arkadecash init                      # Create new seed (or --mnemonic to restore)
arkadecash unlock                    # Unlock with password
arkadecash lock                      # Lock the daemon
arkadecash status                    # Show daemon state
arkadecash balance                   # Aggregate balance across all wallets
arkadecash mints                     # List registered mints
arkadecash add-mint --type cashu --url <mint-url>
arkadecash add-mint --type fedimint --invite <code>
```

### Payments

```bash
arkadecash deposit <amount_sats>     # Create Lightning invoice to receive
arkadecash pay <bolt11_invoice>      # Pay from a private mint
arkadecash send <mint_id> <amount>   # Create bearer ecash token
arkadecash receive <token>           # Redeem bearer ecash token
```

### Lightning (via Boltz)

```bash
arkadecash lightning send <invoice>       # Pay invoice via submarine swap
arkadecash lightning receive <amount>     # Create invoice via reverse swap
arkadecash lightning fees                 # Show swap fee structure
```

### BTC↔Stablecoin Swaps (via Lendasat)

```bash
arkadecash swap quote <from> <to> <amount>
arkadecash swap create <address> <amount> <token>
arkadecash swap status <swap_id>
arkadecash swap list
arkadecash swap claim <swap_id>
arkadecash swap pairs
```

### Inspect

```bash
arkadecash tools                     # List all available tool definitions
```

## Daemon

Run as a long-lived process with MCP and/or HTTP transport:

```bash
arkadecash-daemon --http --http-port 3100
arkadecash-daemon -p <password>          # Auto-unlock on start
arkadecash-daemon --no-mcp               # Disable MCP server
```

## MCP Server

The daemon exposes all tools via [Model Context Protocol](https://modelcontextprotocol.io) over stdio. Add to your agent's MCP config:

```json
{
  "mcpServers": {
    "arkadecash": {
      "command": "npx",
      "args": ["@zerosats/arkadecash-cli", "daemon", "-p", "<password>"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "arkadecash": {
      "command": "arkadecash-daemon",
      "args": ["-p", "<password>"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `deposit` | Receive Bitcoin via Arkade, split to private mints |
| `deposit_from_arkade` | Move funds from Arkade to a private mint |
| `pay` | Pay Lightning invoice from a private mint |
| `balance` | Aggregate balance across all wallets |
| `distribute` | Move funds between mints |
| `send_ecash` | Generate bearer ecash token |
| `receive_ecash` | Redeem bearer ecash token |
| `list_mints` | List registered mints with balances |
| `add_mint` | Register a Cashu mint or Fedimint federation |
| `arkade_balance` | Arkade wallet balance |
| `arkade_address` | Arkade deposit address |
| `lightning_send` | Pay Lightning via Boltz submarine swap |
| `lightning_receive` | Create Lightning invoice via Boltz reverse swap |
| `lightning_fees` | Boltz swap fee structure |
| `swap_quote` | Lendasat BTC↔stablecoin quote |
| `swap_create` | Create BTC→stablecoin swap |
| `swap_status` | Check swap status |
| `swap_list` | List all swaps |
| `swap_claim` | Claim completed swap |
| `swap_pairs` | Supported trading pairs |

## Configuration

Config is loaded from (in order):

1. `--config <path>` flag
2. `./arkadecash.config.json`
3. `./config/arkadecash.json`
4. `~/.config/arkadecash/config.json`

### Example Config

```json
{
  "dataDir": "./data",
  "logLevel": "info",
  "arkade": {
    "serverUrl": "https://arkade.computer"
  },
  "boltz": {
    "apiUrl": "https://api.ark.boltz.exchange"
  },
  "lendasat": {
    "apiUrl": "https://apilendaswap.lendasat.com"
  },
  "mints": [],
  "defaultSplitStrategy": {
    "type": "equal"
  },
  "http": {
    "enabled": false,
    "port": 3100
  },
  "mcp": {
    "enabled": true
  }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PPD_DATA_DIR` | Data directory path |
| `PPD_LOG_LEVEL` | Log level (debug, info, warn, error) |
| `PPD_HTTP_ENABLED` | Enable HTTP API (`true`/`false`) |
| `PPD_HTTP_PORT` | HTTP port |
| `ARKADECASH_ARKADE_SERVER_URL` | Arkade server URL |
| `ARKADECASH_BOLTZ_API_URL` | Boltz API URL |
| `ARKADECASH_LENDASAT_API_URL` | Lendasat API URL |

## License

MIT
