import { ClawallexHttpClient } from "./client.js";
import type { WhoamiResponse, BootstrapResponse } from "./types.js";
import type {
  WalletDetail,
  RechargeAddressesResponse,
  X402Authorization,
  X402PaymentPayload,
  X402PaymentRequirements,
  PayeeAddressParams,
  PayeeAddressResponse,
  AssetAddressParams,
  AssetAddressResponse,
  CreateCardOrderParams,
  CardOrderResponse,
  ListCardsParams,
  CardListResponse,
  CardBalanceResponse,
  CardDetailsResponse,
  ListTransactionsParams,
  TransactionListResponse,
  RefillCardParams,
  RefillResponse,
} from "./types.js";

export { ClawallexApiError, ClawallexPaymentRequiredError } from "./client.js";
export { ModeCode, CardType } from "./types.js";
export type {
  X402Authorization,
  X402PaymentPayload,
  X402PaymentRequirements,
  PayeeAddressParams,
  PayeeAddressResponse,
  AssetAddressParams,
  AssetAddressResponse,
  WalletDetail,
  RechargeAddress,
  RechargeAddressesResponse,
  CreateCardOrderParams,
  CardOrder402Details,
  CardOrder,
  CardOrderResponse,
  ListCardsParams,
  Card,
  CardListResponse,
  CardBalanceResponse,
  EncryptedSensitiveData,
  CardDetailsResponse,
  ListTransactionsParams,
  Transaction,
  TransactionListResponse,
  RefillCardParams,
  RefillResponse,
} from "./types.js";

export interface ClawallexSDKOptions {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  /**
   * If provided, skips whoami/bootstrap and uses this clientId directly.
   * If omitted, the SDK calls whoami; if already bound it uses the bound
   * clientId, otherwise it calls bootstrap to create and bind a new one.
   */
  clientId?: string;
}

export class ClawallexSDK {
  readonly clientId: string;
  private readonly http: ClawallexHttpClient;

  private constructor(options: ClawallexSDKOptions, resolvedClientId: string) {
    this.clientId = resolvedClientId;
    this.http = new ClawallexHttpClient(
      options.apiKey,
      options.apiSecret,
      options.baseUrl,
      resolvedClientId,
    );
  }

  static async create(options: ClawallexSDKOptions): Promise<ClawallexSDK> {
    if (options.clientId) {
      return new ClawallexSDK(options, options.clientId);
    }
    const authHttp = new ClawallexHttpClient(options.apiKey, options.apiSecret, options.baseUrl, "");
    const whoami = await authHttp.getAuth<WhoamiResponse>("/auth/whoami");
    const clientId = whoami.client_id_bound
      ? whoami.bound_client_id
      : (await authHttp.postAuth<BootstrapResponse>("/auth/bootstrap", {})).client_id;
    return new ClawallexSDK(options, clientId);
  }

  // ── Wallet ──────────────────────────────────────────────────────────────────

  walletDetail(): Promise<WalletDetail> {
    return this.http.get<WalletDetail>("/payment/wallets/detail");
  }

  rechargeAddresses(walletId: string): Promise<RechargeAddressesResponse> {
    return this.http.get<RechargeAddressesResponse>(`/payment/wallets/${walletId}/recharge-addresses`);
  }

  // ── X402 ────────────────────────────────────────────────────────────────────

  x402PayeeAddress(params: PayeeAddressParams): Promise<PayeeAddressResponse> {
    return this.http.get<PayeeAddressResponse>("/payment/x402/payee-address", {
      chain_code: params.chain_code ?? "ETH",
      token_code: params.token_code,
    });
  }

  x402AssetAddress(params: AssetAddressParams): Promise<AssetAddressResponse> {
    return this.http.get<AssetAddressResponse>("/payment/x402/asset-address", {
      chain_code: params.chain_code ?? "ETH",
      token_code: params.token_code,
    });
  }

  // ── Cards ────────────────────────────────────────────────────────────────────

  newCard(params: CreateCardOrderParams): Promise<CardOrderResponse> {
    return this.http.post<CardOrderResponse>("/payment/card-orders", params);
  }

  cardList(params?: ListCardsParams): Promise<CardListResponse> {
    const query: Record<string, string | number> = {};
    if (params?.page !== undefined) query.page = params.page;
    if (params?.page_size !== undefined) query.page_size = params.page_size;
    return this.http.get<CardListResponse>("/payment/cards", query);
  }

  cardBalance(cardId: string): Promise<CardBalanceResponse> {
    return this.http.get<CardBalanceResponse>(`/payment/cards/${cardId}/balance`);
  }

  cardDetails(cardId: string): Promise<CardDetailsResponse> {
    return this.http.get<CardDetailsResponse>(`/payment/cards/${cardId}/details`);
  }

  // ── Transactions ─────────────────────────────────────────────────────────────

  transactionList(params?: ListTransactionsParams): Promise<TransactionListResponse> {
    const query: Record<string, string | number> = {};
    if (params?.card_tx_id !== undefined) query.card_tx_id = params.card_tx_id;
    if (params?.issuer_tx_id !== undefined) query.issuer_tx_id = params.issuer_tx_id;
    if (params?.card_id !== undefined) query.card_id = params.card_id;
    if (params?.page !== undefined) query.page = params.page;
    if (params?.page_size !== undefined) query.page_size = params.page_size;
    return this.http.get<TransactionListResponse>("/payment/transactions", query);
  }

  // ── Refill ───────────────────────────────────────────────────────────────────

  refillCard(cardId: string, params: RefillCardParams): Promise<RefillResponse> {
    return this.http.post<RefillResponse>(`/payment/cards/${cardId}/refill`, params);
  }
}
