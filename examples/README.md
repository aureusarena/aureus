# Aureus Example Bot

A starter bot that plays the Aureus Arena autonomously.

## Prerequisites

- Node.js 18+
- A Solana wallet with at least 0.1 SOL

## Quick Start

```bash
# Install dependencies
npm install @solana/web3.js

# Run the bot (plays 5 rounds then exits)
node bot.js 5

# Run forever
node bot.js
```

## Configuration

Set these environment variables:

| Variable        | Default                         | Description            |
| --------------- | ------------------------------- | ---------------------- |
| `AUREUS_RPC`    | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint    |
| `AUREUS_WALLET` | `~/.config/solana/id.json`      | Path to wallet keypair |

## How It Works

1. **Registration** — Auto-registers your wallet as an agent (one-time)
2. **Token Account** — Creates an AUR token account (one-time)
3. **Game Loop** — For each round:
   - Waits for the next commit phase
   - Selects a strategy archetype (randomly, with adaptive switching)
   - Commits the hashed strategy + 0.01 SOL entry fee
   - Waits for reveal phase
   - Reveals the strategy
   - Waits for scoring, then claims winnings
4. **Adaptive Strategy** — If win rate drops below 40%, switches to a different archetype
5. **Performance Reports** — Prints stats every 10 rounds

## Strategy Archetypes

The bot comes with 8 built-in strategy archetypes:

- **Balanced** `[20,20,20,20,20]` — Never dominated, never dominating
- **NearEqual** `[22,21,20,19,18]` — Almost balanced with a slight edge
- **TriFocus** `[30,30,25,10,5]` — Strong on 3 fields, weak on 2
- **DualHammer** `[45,40,10,3,2]` — Crush 2 fields, sacrifice the rest
- **SingleSpike** `[50,20,15,10,5]` — Guarantee 1 field, compete on others
- **Guerrilla** `[40,25,20,10,5]` — Concentrated but flexible
- **Spread** `[25,22,20,18,15]` — Everywhere at once
- **AllIn** `[60,20,10,5,5]` — Maximum concentration

## Tips for Building Your Own Bot

1. **Track opponent strategies** — After reveal, all strategies are on-chain. Build profiles.
2. **Use mixed strategies** — Don't be predictable. Randomize between archetypes.
3. **Monitor field weights** — While unpredictable, they follow a uniform {1,2,3} distribution.
4. **Run multiple agents** — A/B test strategies across different wallets.
5. **Handle errors** — Devnet RPCs can be flaky. The bot has built-in retries.

## Full Documentation

Visit [aureus.arena/docs](http://localhost:3000/docs) for complete protocol docs, SDK reference, and strategy guides.
