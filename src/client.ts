import { createHmac, createHash } from "node:crypto";
import type { CardOrder402Details } from "./types.js";

export interface ApiError {
  code: string;
  message: string;
}

export class ClawallexApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ClawallexApiError";
  }
}

export class ClawallexPaymentRequiredError extends Error {
  readonly statusCode = 402;
  readonly code: string;
  readonly details: CardOrder402Details;

  constructor(code: string, message: string, details: CardOrder402Details) {
    super(message);
    this.name = "ClawallexPaymentRequiredError";
    this.code = code;
    this.details = details;
  }
}

export class ClawallexHttpClient {
  private readonly basePath = "/api/v1";

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly baseUrl: string,
    private readonly clientId: string,
  ) {}

  private sign(
    method: string,
    path: string,
    body: string,
    includeClientId = true,
  ): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const canonical = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
    const signature = createHmac("sha256", this.apiSecret)
      .update(canonical)
      .digest("base64");
    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      "X-Timestamp": timestamp,
      "X-Signature": signature,
      "Content-Type": "application/json",
    };
    if (includeClientId) {
      headers["X-Client-Id"] = this.clientId;
    }
    return headers;
  }

  async get<T>(path: string, query?: Record<string, string | number>): Promise<T> {
    const fullPath = `${this.basePath}${path}`;
    const url = new URL(fullPath, this.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && String(v) !== "") {
          url.searchParams.set(k, String(v));
        }
      }
    }
    const headers = this.sign("GET", fullPath, "");
    const res = await fetch(url.toString(), { method: "GET", headers });
    return this.handleResponse<T>(res);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const fullPath = `${this.basePath}${path}`;
    const url = new URL(fullPath, this.baseUrl);
    const rawBody = JSON.stringify(body);
    const headers = this.sign("POST", fullPath, rawBody);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: rawBody,
    });
    return this.handleResponse<T>(res);
  }

  /** GET without X-Client-Id, for /auth/* endpoints */
  async getAuth<T>(path: string): Promise<T> {
    const fullPath = `${this.basePath}${path}`;
    const url = new URL(fullPath, this.baseUrl);
    const headers = this.sign("GET", fullPath, "", false);
    const res = await fetch(url.toString(), { method: "GET", headers });
    return this.handleResponse<T>(res);
  }

  /** POST without X-Client-Id, for /auth/* endpoints */
  async postAuth<T>(path: string, body: unknown): Promise<T> {
    const fullPath = `${this.basePath}${path}`;
    const url = new URL(fullPath, this.baseUrl);
    const rawBody = JSON.stringify(body);
    const headers = this.sign("POST", fullPath, rawBody, false);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: rawBody,
    });
    return this.handleResponse<T>(res);
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (res.status === 402) {
      let code = "PAYMENT_REQUIRED";
      let message = "Payment required";
      let details: CardOrder402Details = {} as CardOrder402Details;
      try {
        const parsed = JSON.parse(text) as { code?: string; message?: string; details?: CardOrder402Details };
        code = parsed.code ?? code;
        message = parsed.message ?? message;
        details = parsed.details ?? ({} as CardOrder402Details);
      } catch {
        // keep defaults
      }
      throw new ClawallexPaymentRequiredError(code, message, details);
    }
    if (!res.ok) {
      let code = "UNKNOWN_ERROR";
      let message = text;
      try {
        const parsed = JSON.parse(text) as ApiError;
        code = parsed.code ?? code;
        message = parsed.message ?? message;
      } catch {
        // keep raw text as message
      }
      throw new ClawallexApiError(res.status, code, message);
    }
    return JSON.parse(text) as T;
  }
}
