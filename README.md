# @clawallex/sdk

TypeScript/Node.js SDK for the Clawallex Payment API.

## Installation

```bash
npm install @clawallex/sdk
```

## Quick Start

```typescript
import { ClawallexSDK } from "@clawallex/sdk";

// First run — SDK auto-resolves client_id via whoami/bootstrap
const client = await ClawallexSDK.create({
  apiKey: "your-api-key",
  apiSecret: "your-api-secret",
  baseUrl: "https://api.clawallex.com",
});

// ⬇️ Persist client.clientId to your config/database/env
// e.g. "ca_8f0d2c3e5a1b4c7d"
console.log(client.clientId);

// Subsequent runs — pass the stored client_id to skip network calls
const client2 = await ClawallexSDK.create({
  apiKey: "your-api-key",
  apiSecret: "your-api-secret",
  baseUrl: "https://api.clawallex.com",
  clientId: "ca_8f0d2c3e5a1b4c7d", // the value you persisted
});
```

## Client ID

`client_id` is your application's stable identity on Clawallex, separate from the API Key.

- You can rotate API Keys (revoke old, create new) without losing access to existing cards and transactions — just keep using the same `client_id`
- When a new API Key sends its first request with an existing `client_id`, the server auto-binds the new key to that identity
- Once bound, a `client_id` cannot be changed for that API Key (TOFU — Trust On First Use)
- Cards and transactions are isolated by `client_id` — different `client_id`s cannot see each other's data
- Wallet balance is shared at the user level (across all `client_id`s under the same user)

### Resolution

If `client_id` is provided at initialization, the SDK uses it directly (no network calls). If omitted, the SDK calls `GET /auth/whoami` — if already bound, uses the existing `client_id`; if not, calls `POST /auth/bootstrap` to generate and bind a new one.

### Best Practice

Persist the resolved `client_id` after the first initialization and pass it explicitly on subsequent sessions. This avoids unnecessary network calls and ensures identity continuity across API Key rotations.

### Data Isolation

| Scope | Isolation Level |
|-------|----------------|
| Wallet balance | User-level — shared across all `client_id`s under the same user |
| Cards | `client_id`-scoped — only visible to the `client_id` that created them |
| Transactions | `client_id`-scoped — only visible to the `client_id` that owns the card |
| Recharge addresses | User-level — shared |

## API

```typescript
// Wallet
const wallet = await client.walletDetail();
const addresses = await client.rechargeAddresses(wallet.wallet_id);

// X402 — chain_code defaults to "ETH" if omitted
const payee = await client.x402PayeeAddress({ token_code: "USDC" });
const asset = await client.x402AssetAddress({ token_code: "USDC", chain_code: "BASE" });

// Cards
const order = await client.newCard(params);
const { data } = await client.cardList({ page: 1, page_size: 20 });
const balance = await client.cardBalance("card-id");
const details = await client.cardDetails("card-id");

// Transactions
const txs = await client.transactionList({ card_id: "card-id", page: 1, page_size: 20 });

// Refill
const refill = await client.refillCard("card-id", params);
```

## Mode A — Wallet Funded Card

Mode A is the simplest path: cards are paid from your Clawallex wallet balance. No blockchain interaction needed.

### Create a Card

```typescript
const order = await client.newCard({
  mode_code: 100,          // Mode A
  card_type: 100,          // 100=flash (single-use), 200=stream (rechargeable)
  amount: "50.0000",       // card face value in USD
  client_request_id: crypto.randomUUID(),  // idempotency key
});

// order.card_order_id — always present
// order.card_id       — present if card created synchronously
// order.status        — 200=active, 120=pending_async (issuer processing)
```

### Handling Async Card Creation (status=120)

Card creation may be asynchronous — the issuer accepts the request but hasn't finished yet. **This is normal**, not an error. The wallet has already been charged.

```typescript
if (order.status === 120 || !order.card_id) {
  // Poll card list until the new card appears
  const before = await client.cardList({ page: 1, page_size: 100 });
  const existingIds = new Set(before.data.map(c => c.card_id));

  let cardId: string | undefined;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const list = await client.cardList({ page: 1, page_size: 100 });
    const newCard = list.data.find(c => !existingIds.has(c.card_id));
    if (newCard) {
      cardId = newCard.card_id;
      break;
    }
  }
}
```

> **Tip**: You can also retry `newCard` with the same `client_request_id`. The server will safely retry the issuer call without re-charging your wallet.

### Mode A Refill

```typescript
const refill = await client.refillCard(cardId, {
  amount: "30.0000",
  client_request_id: crypto.randomUUID(),  // idempotency key for Mode A
});
```

## Fee Structure

Fees are calculated server-side. For Mode B, the 402 response breaks them down:

| Fee field | Applies to | Description |
|-----------|-----------|-------------|
| `issue_fee_amount` | All cards | One-time card issuance fee |
| `monthly_fee_amount` | Stream cards only | First month fee (included in initial charge) |
| `fx_fee_amount` | All cards | Foreign exchange fee |
| `fee_amount` | — | `= issue_fee_amount + monthly_fee_amount + fx_fee_amount` |
| `payable_amount` | — | `= amount + fee_amount` (total to pay) |

- Flash cards: `fee_amount = issue_fee + fx_fee`
- Stream cards: `fee_amount = issue_fee + monthly_fee + fx_fee`
- Mode A refill: **no fees** — the refill amount goes directly to the card
- Mode B refill: **no fees** — same as Mode A

## Mode B — x402 On-Chain Payment (Two-Step)

Mode B is for Agents that hold their own wallet and private key. The card is funded by an on-chain USDC transfer via the EIP-3009 `transferWithAuthorization` standard — no human intervention needed.

> **Mode B currently only supports USDC** (6 decimals) on ETH and BASE chains. `token_code` must be `"USDC"`.

### Flow

```
Agent → POST /card-orders (mode_code=200)     → 402 + quote details
Agent → sign EIP-3009 with private key
Agent → POST /card-orders (same client_request_id) → 200 + card created
```

### Stage 1 — Request Quote (402 is expected, not an error)

```typescript
import {
  ClawallexPaymentRequiredError,
  type CardOrder402Details,
} from "@clawallex/sdk";

const clientRequestId = crypto.randomUUID();
let details: CardOrder402Details;

try {
  await client.newCard({
    mode_code: 200,
    card_type: 200,          // 100=flash, 200=stream
    amount: "200.0000",
    client_request_id: clientRequestId,
    chain_code: "ETH",       // or "BASE"
    token_code: "USDC",
  });
} catch (err) {
  if (err instanceof ClawallexPaymentRequiredError) {
    details = err.details;
    // details contains:
    //   payee_address    — system receiving address
    //   asset_address    — USDC contract address
    //   payable_amount   — total including fees (e.g. "207.5900")
    //   x402_reference_id — must be echoed in Stage 2
    //   final_card_amount, fee_amount, issue_fee_amount, monthly_fee_amount, fx_fee_amount
  }
}
```

### EIP-3009 Signing (using ethers.js)

```typescript
import { ethers } from "ethers";

const wallet = new ethers.Wallet(PRIVATE_KEY);
const maxAmountRequired = String(Math.round(parseFloat(details.payable_amount) * 1_000_000));
const now = Math.floor(Date.now() / 1000);
const nonce = ethers.hexlify(ethers.randomBytes(32));

const signature = await wallet.signTypedData(
  {
    name: "USDC",                        // query via contract.name() — varies by chain
    version: "2",
    chainId: 11155111,                   // Sepolia; ETH mainnet=1, BASE=8453
    verifyingContract: details.asset_address,
  },
  {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  {
    from: wallet.address,
    to: details.payee_address,
    value: maxAmountRequired,
    validAfter: String(now - 60),
    validBefore: String(now + 3600),
    nonce,
  },
);
```

> **Note**: The EIP-712 domain `name` depends on the USDC contract deployment.
> On Sepolia testnet it is `"USDC"`, on mainnet it may be `"USD Coin"`.
> Query the contract's `name()` method to confirm.

### Stage 2 — Submit Payment

> **IMPORTANT**: Stage 2 **must** use the same `client_request_id` as Stage 1.
> A different `client_request_id` will create a **new** card order instead of completing the current one.

The SDK provides typed interfaces `X402PaymentPayload` and `X402PaymentRequirements` for full autocomplete support:

```typescript
import type { X402PaymentPayload, X402PaymentRequirements } from "@clawallex/sdk";

const order = await client.newCard({
  mode_code: 200,
  card_type: 200,
  amount: "200.0000",
  client_request_id: clientRequestId,    // MUST reuse from Stage 1
  x402_version: 1,
  payment_payload: {
    scheme: "exact",
    network: "ETH",
    payload: {
      signature,
      authorization: {
        from: wallet.address,
        to: details.payee_address,         // must equal payee_address
        value: maxAmountRequired,
        validAfter: String(now - 60),
        validBefore: String(now + 3600),
        nonce,
      },
    },
  },
  payment_requirements: {
    scheme: "exact",
    network: "ETH",                        // must equal payload.network
    asset: details.asset_address,          // must equal 402 asset_address
    payTo: details.payee_address,          // must equal authorization.to
    maxAmountRequired,                     // must equal authorization.value
    extra: {
      referenceId: details.x402_reference_id,
    },
  },
  extra: {
    card_amount: details.final_card_amount,  // must equal original amount
    paid_amount: details.payable_amount,     // must equal amount + fee
  },
  payer_address: wallet.address,
});
// order: { card_order_id, card_id, status }
```

### Mode B Refill (No 402 — Direct Submit)

Refill has **no 402 challenge**. Query addresses first, then submit directly:

```typescript
// 1. query addresses
const payee = await client.x402PayeeAddress({ token_code: "USDC", chain_code: "ETH" });
const asset = await client.x402AssetAddress({ token_code: "USDC", chain_code: "ETH" });

// 2. sign EIP-3009 (same as above, but amount has no fee)
const refillAmount = "30.0000";
const maxAmt = String(Math.round(parseFloat(refillAmount) * 1_000_000));
// ... sign with wallet ...

// 3. submit refill
const refill = await client.refillCard(cardId, {
  amount: refillAmount,
  x402_reference_id: crypto.randomUUID(),  // unique per refill
  x402_version: 1,
  payment_payload: { /* same structure as card-orders */ },
  payment_requirements: { /* same structure */ },
  payer_address: wallet.address,
});
```

### Consistency Rules (Server Rejects if Any Fail)

| # | Rule |
|---|------|
| 1 | `payment_payload.network` == `payment_requirements.network` |
| 2 | `authorization.to` == `payTo` == 402 `payee_address` |
| 3 | `authorization.value` == `maxAmountRequired` == `payable_amount × 10^6` |
| 4 | `payment_requirements.asset` == 402 `asset_address` |
| 5 | `extra.referenceId` == 402 `x402_reference_id` |
| 6 | `extra.card_amount` == original `amount` |
| 7 | `extra.paid_amount` == 402 `payable_amount` |

## Card Details — Decrypting PAN/CVV

`cardDetails` returns encrypted sensitive data. The server encrypts with a key derived from your `api_secret`.

```typescript
import { createHash, createHmac, createDecipheriv } from "node:crypto";
import { hkdf } from "node:crypto";

const details = await client.cardDetails("card-id");
const enc = details.encrypted_sensitive_data;
// enc.version = "v1", enc.algorithm = "AES-256-GCM", enc.kdf = "HKDF-SHA256"

// 1. Derive 32-byte key from api_secret using HKDF-SHA256
const ikm = Buffer.from(API_SECRET);
const salt = Buffer.alloc(0);
const info = Buffer.from("clawallex-card-sensitive-data");
const derivedKey = await new Promise<Buffer>((resolve, reject) => {
  hkdf("sha256", ikm, salt, info, 32, (err, key) => {
    err ? reject(err) : resolve(Buffer.from(key));
  });
});

// 2. Decrypt with AES-256-GCM
const nonce = Buffer.from(enc.nonce, "base64");
const ciphertext = Buffer.from(enc.ciphertext, "base64");
const authTag = ciphertext.subarray(ciphertext.length - 16);
const encrypted = ciphertext.subarray(0, ciphertext.length - 16);

const decipher = createDecipheriv("aes-256-gcm", derivedKey, nonce);
decipher.setAuthTag(authTag);
const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

const { pan, cvv } = JSON.parse(decrypted.toString("utf-8"));
// pan = "4111111111111111", cvv = "123"
```

> **Security**: Never log or persist the decrypted PAN/CVV in plaintext. The `api_secret` must be at least 16 bytes.

## Error Handling

```typescript
import { ClawallexApiError, ClawallexPaymentRequiredError } from "@clawallex/sdk";

try {
  await client.newCard(params);
} catch (err) {
  if (err instanceof ClawallexPaymentRequiredError) {
    // Mode B step 1 — normal flow, proceed with on-chain payment
    const { payee_address, asset_address, payable_amount } = err.details;
  } else if (err instanceof ClawallexApiError) {
    console.error(err.statusCode, err.code, err.message);
  }
}
```

## Enums Reference

| Constant | Value | Description |
|----------|-------|-------------|
| `mode_code` | `100` | Mode A — wallet funded |
| `mode_code` | `200` | Mode B — x402 on-chain |
| `card_type` | `100` | Flash card |
| `card_type` | `200` | Stream card (subscription) |
| `card.status` | `200` | Active |
| `card.status` | `220` | Closing |
| `card.status` | `230` | Expired |
| `card.status` | `250` | Cancelled |
| `wallet.status` | `100` | Normal |
| `wallet.status` | `210` | Frozen |
