// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface WhoamiResponse {
  user_id: string;
  api_key_id: string;
  status: number;
  bound_client_id: string;
  client_id_bound: boolean;
}

export interface BootstrapParams {
  preferred_client_id?: string;
}

export interface BootstrapResponse {
  client_id: string;
  created: boolean;
}

// ─── X402 ─────────────────────────────────────────────────────────────────────

export interface PayeeAddressParams {
  token_code: string;
  /** @default "ETH" */
  chain_code?: string;
}

export interface PayeeAddressResponse {
  chain_code: string;
  token_code: string;
  address: string;
}

export interface AssetAddressParams {
  token_code: string;
  /** @default "ETH" */
  chain_code?: string;
}

export interface AssetAddressResponse {
  chain_code: string;
  token_code: string;
  asset_address: string;
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export interface WalletDetail {
  wallet_id: string;
  wallet_type: number;
  currency: string;
  available_balance: string;
  frozen_balance: string;
  low_balance_threshold: string;
  status: number;
  updated_at: string;
}

export interface RechargeAddress {
  recharge_address_id: string;
  wallet_id: string;
  chain_code: string;
  token_code: string;
  address: string;
  memo_tag: string;
  status: number;
  updated_at: string;
}

export interface RechargeAddressesResponse {
  wallet_id: string;
  total: number;
  data: RechargeAddress[];
}

// ─── x402 / EIP-3009 payload types ───────────────────────────────────────────

/**
 * EIP-3009 `transferWithAuthorization` fields.
 *
 * @see https://eips.ethereum.org/EIPS/eip-3009
 */
export interface X402Authorization {
  /** Agent wallet address (payer) */
  from: string;
  /** System payee address — must equal 402 `payee_address` */
  to: string;
  /** `payable_amount × 10^decimals` as string (USDC decimals=6, e.g. `"207590000"`) */
  value: string;
  /** Unix seconds, recommended `now - 60` */
  validAfter: string;
  /** Unix seconds, recommended `now + 3600` */
  validBefore: string;
  /** Random 32-byte hex with `0x` prefix — must be unique per authorization */
  nonce: string;
}

/** x402 payment payload — wraps the EIP-3009 signature + authorization. */
export interface X402PaymentPayload {
  /** Fixed `"exact"` */
  scheme: "exact";
  /** Chain network: `"ETH"` / `"BASE"` */
  network: string;
  payload: {
    /** EIP-3009 typed-data signature hex */
    signature: string;
    authorization: X402Authorization;
  };
}

/** x402 payment requirements — describes what the payment must satisfy. */
export interface X402PaymentRequirements {
  /** Fixed `"exact"` */
  scheme: "exact";
  /** Must equal `payment_payload.network` */
  network: string;
  /** Token contract address — must equal 402 `asset_address` */
  asset: string;
  /** System payee address — must equal 402 `payee_address` and `authorization.to` */
  payTo: string;
  /** Must equal `authorization.value` */
  maxAmountRequired: string;
  extra: {
    /** Must equal 402 `x402_reference_id` */
    referenceId: string;
  };
}

// ─── Cards ────────────────────────────────────────────────────────────────────

export interface CreateCardOrderParams {
  mode_code: number;
  card_type: number;
  amount: string;
  client_request_id: string;
  fee_amount?: string;
  issuer_card_currency?: string;
  issuer_spending_controls?: string;
  allow_3ds_transactions?: string;
  /** Mode B Stage 1: chain code, e.g. `"ETH"` / `"BASE"` */
  chain_code?: string;
  /** Mode B Stage 1: token code, e.g. `"USDC"` */
  token_code?: string;
  x402_reference_id?: string;
  /** Mode B Stage 2: fixed `1` */
  x402_version?: number;
  /** Mode B Stage 2: EIP-3009 signed payload */
  payment_payload?: X402PaymentPayload;
  /** Mode B Stage 2: payment requirements from 402 quote */
  payment_requirements?: X402PaymentRequirements;
  /** Mode B Stage 2: `{ card_amount: "amount", paid_amount: "payable_amount" }` */
  extra?: Record<string, string>;
  payer_address?: string;
}

/** Mode B first request returns HTTP 402 — thrown as ClawallexPaymentRequiredError */
export interface CardOrder402Details {
  card_order_id: string;
  client_request_id: string;
  x402_reference_id: string;
  payee_address: string;
  asset_address: string;
  final_card_amount: string;
  issue_fee_amount: string;
  monthly_fee_amount: string;
  fx_fee_amount: string;
  fee_amount: string;
  payable_amount: string;
}

export interface CardOrder {
  card_order_id: string;
  card_id: string;
  status: number;
  /** Mode B: x402 reference id */
  reference_id?: string;
  idempotent?: boolean;
}

export type CardOrderResponse = CardOrder;

export interface ListCardsParams {
  page?: number;
  page_size?: number;
}

export interface Card {
  card_id: string;
  mode_code: number;
  card_type: number;
  status: number;
  masked_pan: string;
  card_currency: string;
  available_balance: string;
  expiry_month: number;
  expiry_year: number;
  issuer_card_status: string;
  updated_at: string;
}

export interface CardListResponse {
  total: number;
  page: number;
  page_size: number;
  data: Card[];
}

export interface CardBalanceResponse {
  card_id: string;
  card_currency: string;
  available_balance: string;
  status: number;
  updated_at: string;
}

export interface EncryptedSensitiveData {
  version: string;
  algorithm: string;
  kdf: string;
  nonce: string;
  ciphertext: string;
}

export interface CardDetailsResponse {
  card_id: string;
  masked_pan: string;
  encrypted_sensitive_data: EncryptedSensitiveData;
  expiry_month: number;
  expiry_year: number;
  card_currency: string;
  available_balance: string;
  first_name: string;
  last_name: string;
  /** Billing address — JSON string or plain text */
  delivery_address: string;
  status: number;
  issuer_card_status: string;
  updated_at: string;
}


// ─── Transactions ─────────────────────────────────────────────────────────────

export interface ListTransactionsParams {
  card_tx_id?: string;
  issuer_tx_id?: string;
  card_id?: string;
  page?: number;
  page_size?: number;
}

export interface Transaction {
  card_id: string;
  card_tx_id: string;
  issuer_tx_id: string;
  action_type: number;
  tx_type: number;
  amount: string;
  fee_amount: string;
  status: number;
  is_in_progress: number;
  merchant_name: string;
  mcc: string;
  decline_reason: string;
  occurred_at: string;
  settled_at: string | null;
  webhook_event_id: string;
}

export interface TransactionListResponse {
  card_tx_id: string;
  issuer_tx_id: string;
  card_id: string;
  page: number;
  page_size: number;
  total: number;
  data: Transaction[];
}

// ─── Refill ───────────────────────────────────────────────────────────────────

export interface RefillCardParams {
  amount: string;
  /** Mode A manual refill: required idempotency key */
  client_request_id?: string;
  /** Mode B: idempotency key (must be unique per refill) */
  x402_reference_id?: string;
  /** Mode B: fixed `1` */
  x402_version?: number;
  /** Mode B: EIP-3009 signed payload */
  payment_payload?: X402PaymentPayload;
  /** Mode B: payment requirements */
  payment_requirements?: X402PaymentRequirements;
  payer_address?: string;
}

export interface RefillResponse {
  card_id: string;
  refill_order_id: string;
  refilled_amount: string;
  /** "success" | "idempotent" */
  status: string;
  /** Mode A */
  related_transfer_id?: string;
  /** Mode B */
  x402_payment_id?: string;
}

