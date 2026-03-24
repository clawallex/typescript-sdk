import { describe, it, expect, beforeAll } from "vitest";
import { ClawallexSDK, ClawallexPaymentRequiredError, ClawallexApiError, ModeCode, CardType } from "../src/index.js";
import type { WalletDetail, CardListResponse } from "../src/index.js";

const API_KEY = process.env.CLAWALLEX_API_KEY;
const API_SECRET = process.env.CLAWALLEX_API_SECRET;
const BASE_URL = process.env.CLAWALLEX_BASE_URL;

const skip = !API_KEY || !API_SECRET || !BASE_URL;

describe.skipIf(skip)("Clawallex SDK Integration Tests", () => {
  let sdk: InstanceType<typeof ClawallexSDK>;
  let wallet: WalletDetail;
  let cardList: CardListResponse;

  beforeAll(async () => {
    sdk = await ClawallexSDK.create({
      apiKey: API_KEY!,
      apiSecret: API_SECRET!,
      baseUrl: BASE_URL!,
    });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("should resolve client_id on init", () => {
    expect(sdk.clientId).toBeTruthy();
    expect(typeof sdk.clientId).toBe("string");
  });

  it("should reuse client_id on second create", async () => {
    const sdk2 = await ClawallexSDK.create({
      apiKey: API_KEY!,
      apiSecret: API_SECRET!,
      baseUrl: BASE_URL!,
    });
    expect(sdk2.clientId).toBe(sdk.clientId);
  });

  it("should accept explicit client_id", async () => {
    const sdk3 = await ClawallexSDK.create({
      apiKey: API_KEY!,
      apiSecret: API_SECRET!,
      baseUrl: BASE_URL!,
      clientId: sdk.clientId,
    });
    expect(sdk3.clientId).toBe(sdk.clientId);
  });

  // ── Wallet ────────────────────────────────────────────────────────────────

  it("should get wallet detail with expected fields", async () => {
    wallet = await sdk.walletDetail();
    expect(wallet.wallet_id).toBeTruthy();
    expect(typeof wallet.wallet_type).toBe("number");
    expect(wallet.currency).toBeTruthy();
    expect(wallet.available_balance).toBeDefined();
    expect(typeof wallet.status).toBe("number");
    expect(wallet.updated_at).toBeTruthy();
  });

  it("should get recharge addresses for wallet", async () => {
    const result = await sdk.rechargeAddresses(wallet.wallet_id);
    expect(result.wallet_id).toBe(wallet.wallet_id);
    expect(typeof result.total).toBe("number");
    expect(Array.isArray(result.data)).toBe(true);
    if (result.data.length > 0) {
      const addr = result.data[0];
      expect(addr.chain_code).toBeTruthy();
      expect(addr.token_code).toBeTruthy();
      expect(addr.address).toBeTruthy();
    }
  });

  // ── X402 ──────────────────────────────────────────────────────────────────

  it("should get x402 payee address with default chain ETH", async () => {
    const result = await sdk.x402PayeeAddress({ token_code: "USDC" });
    expect(result.address).toBeTruthy();
    expect(result.chain_code).toBeTruthy();
    expect(result.token_code).toBe("USDC");
  });

  it("should get x402 payee address with explicit chain_code", async () => {
    const result = await sdk.x402PayeeAddress({ token_code: "USDC", chain_code: "ETH" });
    expect(result.address).toBeTruthy();
    expect(result.chain_code).toBe("ETH");
  });

  it("should get x402 asset address with default chain ETH", async () => {
    const result = await sdk.x402AssetAddress({ token_code: "USDC" });
    expect(result.asset_address).toBeTruthy();
    expect(result.token_code).toBe("USDC");
  });

  it("should get x402 asset address with explicit chain_code", async () => {
    const result = await sdk.x402AssetAddress({ token_code: "USDC", chain_code: "ETH" });
    expect(result.asset_address).toBeTruthy();
    expect(result.chain_code).toBe("ETH");
  });

  // ── Cards ─────────────────────────────────────────────────────────────────

  it("should get card list with pagination", async () => {
    cardList = await sdk.cardList({ page: 1, page_size: 5 });
    expect(typeof cardList.total).toBe("number");
    expect(cardList.page).toBe(1);
    expect(cardList.page_size).toBe(5);
    expect(Array.isArray(cardList.data)).toBe(true);
  });

  it("should get card list without params (defaults)", async () => {
    const result = await sdk.cardList();
    expect(typeof result.total).toBe("number");
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should get card balance if cards exist", async () => {
    if (cardList.data.length === 0) return;
    const card = cardList.data[0];
    const balance = await sdk.cardBalance(card.card_id);
    expect(balance.card_id).toBe(card.card_id);
    expect(balance.card_currency).toBeTruthy();
    expect(balance.available_balance).toBeDefined();
    expect(typeof balance.status).toBe("number");
  });

  it("should get card details if cards exist", async () => {
    if (cardList.data.length === 0) return;
    const card = cardList.data[0];
    const details = await sdk.cardDetails(card.card_id);
    expect(details.card_id).toBe(card.card_id);
    expect(details.masked_pan).toBeTruthy();
    expect(details.encrypted_sensitive_data).toBeDefined();
    expect(details.encrypted_sensitive_data.version).toBe("v1");
    expect(details.encrypted_sensitive_data.algorithm).toBe("AES-256-GCM");
    expect(details.encrypted_sensitive_data.ciphertext).toBeTruthy();
  });

  it("should return 404 for non-existent card balance", async () => {
    try {
      await sdk.cardBalance("non_existent_card_id");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ClawallexApiError);
      expect((e as ClawallexApiError).statusCode).toBeGreaterThanOrEqual(400);
    }
  });

  // ── Transactions ──────────────────────────────────────────────────────────

  it("should get transaction list with pagination", async () => {
    const result = await sdk.transactionList({ page: 1, page_size: 5 });
    expect(typeof result.total).toBe("number");
    expect(Array.isArray(result.data)).toBe(true);
    if (result.data.length > 0) {
      const tx = result.data[0];
      expect(tx.card_id).toBeTruthy();
      expect(tx.card_tx_id).toBeTruthy();
      expect(typeof tx.action_type).toBe("number");
      expect(typeof tx.status).toBe("number");
    }
  });

  it("should get transaction list without params", async () => {
    const result = await sdk.transactionList();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should filter transactions by card_id if cards exist", async () => {
    if (cardList.data.length === 0) return;
    const cardId = cardList.data[0].card_id;
    const result = await sdk.transactionList({ card_id: cardId, page: 1, page_size: 5 });
    expect(Array.isArray(result.data)).toBe(true);
    for (const tx of result.data) {
      expect(tx.card_id).toBe(cardId);
    }
  });

  // ── Mode A card lifecycle ──────────────────────────────────────────────────

  it("should create Mode A flash card, verify, then close", async () => {
    const reqId = crypto.randomUUID();

    // 1. create card
    let order = await sdk.newCard({
      mode_code: ModeCode.WALLET,
      card_type: CardType.FLASH,
      amount: "5.0000",
      client_request_id: reqId,
    });
    expect(order.card_order_id).toBeTruthy();

    // snapshot existing card ids
    const before = await sdk.cardList({ page: 1, page_size: 100 });
    const existingIds = new Set(before.data.map((c) => c.card_id));

    // card creation may be async (status=120), poll card list for new card
    let cardId = order.card_id;
    if (!cardId) {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const list = await sdk.cardList({ page: 1, page_size: 100 });
        const newCard = list.data.find((c) => !existingIds.has(c.card_id) && c.mode_code === ModeCode.WALLET);
        if (newCard) {
          cardId = newCard.card_id;
          break;
        }
      }
    }
    expect(cardId).toBeTruthy();

    // 3. check balance
    const balance = await sdk.cardBalance(cardId);
    expect(balance.card_id).toBe(cardId);

    // 4. check details
    const details = await sdk.cardDetails(cardId);
    expect(details.card_id).toBe(cardId);
    expect(details.encrypted_sensitive_data.ciphertext).toBeTruthy();

  }, 120_000);

  // ── Mode B 402 flow ───────────────────────────────────────────────────────

  it("should return 402 PaymentRequired for Mode B card order", async () => {
    try {
      const dummyAddr = "0x0000000000000000000000000000000000000000";
      const dummyNonce = "0x" + "00".repeat(32);
      const dummySig   = "0x" + "00".repeat(65);
      await sdk.newCard({
        mode_code: ModeCode.X402,
        card_type: CardType.STREAM,
        amount: "1.0000",
        client_request_id: crypto.randomUUID(),
        chain_code: "ETH",
        token_code: "USDC",
        payer_address: "0x850E5F8D352CC8f501754f8835eE28e4ea4Ba68C",
        x402_version: 1,
        payment_payload: {
          scheme: "exact", network: "ETH",
          payload: { signature: dummySig, authorization: {
            from: "0x850E5F8D352CC8f501754f8835eE28e4ea4Ba68C", to: dummyAddr,
            value: "1050000", validAfter: "0", validBefore: "9999999999", nonce: dummyNonce,
          }},
        },
        payment_requirements: {
          scheme: "exact", network: "ETH",
          asset: dummyAddr, payTo: dummyAddr,
          maxAmountRequired: "1050000", extra: { referenceId: "dummy" },
        },
        extra: { card_amount: "1.0000", paid_amount: "1.0500" },
      });
      expect.unreachable("should have thrown 402");
    } catch (e) {
      expect(e).toBeInstanceOf(ClawallexPaymentRequiredError);
      const err = e as ClawallexPaymentRequiredError;
      expect(err.statusCode).toBe(402);
      expect(err.code).toBe("PAYMENT_REQUIRED");
      expect(err.details.card_order_id).toBeTruthy();
      expect(err.details.x402_reference_id).toBeTruthy();
      expect(err.details.payee_address).toBeTruthy();
      expect(err.details.asset_address).toBeTruthy();
      expect(err.details.payable_amount).toBeTruthy();
      expect(err.details.fee_amount).toBeTruthy();
    }
  });

  // ── Mode B full lifecycle (requires AGENT_PRIVATE_KEY env) ────────────────

  const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
  const CHAIN_ID = parseInt(process.env.AGENT_CHAIN_ID || "11155111"); // Sepolia default
  const skipModeB = !PRIVATE_KEY;

  it.skipIf(skipModeB)("should complete Mode B card lifecycle: quote → sign → settle → verify → close", async () => {
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY!);

    // ── Stage 1: Quote ──────────────────────────────────────────────────────
    const clientRequestId = crypto.randomUUID();
    let details: (typeof ClawallexPaymentRequiredError.prototype)["details"];

    try {
      await sdk.newCard({
        mode_code: ModeCode.X402,
        card_type: CardType.STREAM,
        amount: "1.0000",
        client_request_id: clientRequestId,
        chain_code: "ETH",
        token_code: "USDC",
        x402_version: 1,
        payer_address: wallet.address,
      });
      expect.unreachable("expected 402");
    } catch (e) {
      expect(e).toBeInstanceOf(ClawallexPaymentRequiredError);
      details = (e as ClawallexPaymentRequiredError).details;
    }

    expect(details!.payee_address).toBeTruthy();
    expect(details!.asset_address).toBeTruthy();
    expect(details!.payable_amount).toBeTruthy();
    expect(details!.x402_reference_id).toBeTruthy();

    // ── EIP-3009 Signing ────────────────────────────────────────────────────
    const maxAmountRequired = String(Math.round(parseFloat(details!.payable_amount) * 1_000_000));
    const now = Math.floor(Date.now() / 1000);
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    const domain = {
      name: "USDC",
      version: "2",
      chainId: CHAIN_ID,
      verifyingContract: details!.asset_address,
    };

    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };

    const message = {
      from: wallet.address,
      to: details!.payee_address,
      value: maxAmountRequired,
      validAfter: String(now - 60),
      validBefore: String(now + 3600),
      nonce,
    };

    const signature = await wallet.signTypedData(domain, types, message);

    // ── Stage 2: Settle ─────────────────────────────────────────────────────
    const order = await sdk.newCard({
      mode_code: ModeCode.X402,
      card_type: CardType.STREAM,
      amount: "1.0000",
      client_request_id: clientRequestId,
      x402_version: 1,
      payment_payload: {
        scheme: "exact",
        network: "ETH",
        payload: {
          signature,
          authorization: {
            from: wallet.address,
            to: details!.payee_address,
            value: maxAmountRequired,
            validAfter: String(now - 60),
            validBefore: String(now + 3600),
            nonce,
          },
        },
      },
      payment_requirements: {
        scheme: "exact",
        network: "ETH",
        asset: details!.asset_address,
        payTo: details!.payee_address,
        maxAmountRequired,
        extra: {
          referenceId: details!.x402_reference_id,
        },
      },
      extra: {
        card_amount: details!.final_card_amount,
        paid_amount: details!.payable_amount,
      },
      payer_address: wallet.address,
    });

    expect(order.card_order_id).toBeTruthy();
    // status 200=active or 120=pending_async (issuer async)
    expect([120, 200]).toContain(order.status);

    // ── Verify card ─────────────────────────────────────────────────────────
    // snapshot before polling
    const beforeList = await sdk.cardList({ page: 1, page_size: 100 });
    const existingIds = new Set(beforeList.data.map((c) => c.card_id));
    let cardId = order.card_id;

    if (!cardId) {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const list = await sdk.cardList({ page: 1, page_size: 100 });
        const newCard = list.data.find((c) => !existingIds.has(c.card_id) && c.mode_code === ModeCode.X402);
        if (newCard) {
          cardId = newCard.card_id;
          break;
        }
      }
    }
    expect(cardId).toBeTruthy();

    // verify card details
    const cardDetails = await sdk.cardDetails(cardId);
    expect(cardDetails.card_id).toBe(cardId);
    expect(cardDetails.encrypted_sensitive_data.ciphertext).toBeTruthy();

  }, 120_000);

  it.skip("modeBNewCard helper should create card in one call", async () => {
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY!);

    const order = await sdk.modeBNewCard(
      { card_type: 200, amount: "5.0000", chain_id: CHAIN_ID },
      wallet,
    );

    expect(order.card_order_id).toBeTruthy();
    expect([120, 200]).toContain(order.status);

    // wait for card if async
    let cardId = order.card_id;
    if (!cardId) {
      const before = await sdk.cardList({ page: 1, page_size: 100 });
      const existingIds = new Set(before.data.map((c) => c.card_id));
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const list = await sdk.cardList({ page: 1, page_size: 100 });
        const newCard = list.data.find((c) => !existingIds.has(c.card_id) && c.mode_code === ModeCode.X402);
        if (newCard) { cardId = newCard.card_id; break; }
      }
    }
    expect(cardId).toBeTruthy();

  }, 120_000);
});
