import type { ApnsEnvironment, PushIdentifierKind, PushProvider } from "./devices.js";

export interface PushMessage {
  provider: PushProvider;
  pushIdentifier: string;
  identifierKind: PushIdentifierKind;
  environment: ApnsEnvironment | null;
  noticeId: string;
  title: string;
  body: string;
  matchedTerm: string;
  matchedField: string;
}

export type DeliveryResult =
  | { kind: "success" }
  | { kind: "transient"; code: string; retryAfterSeconds?: number }
  | { kind: "invalid" | "permanent"; code: string };

export interface PushSender {
  readonly configured: boolean;
  isConfigured(provider: PushProvider): boolean;
  send(message: PushMessage): Promise<DeliveryResult>;
  close(): void;
}

export interface ProviderPushSender {
  readonly provider: PushProvider;
  readonly configured: boolean;
  send(message: PushMessage): Promise<DeliveryResult>;
  close(): void;
}

export class RoutedPushSender implements PushSender {
  private readonly senders: Map<PushProvider, ProviderPushSender>;

  constructor(senders: readonly ProviderPushSender[]) {
    this.senders = new Map(senders.map((sender) => [sender.provider, sender]));
  }

  get configured(): boolean {
    return [...this.senders.values()].some((sender) => sender.configured);
  }

  isConfigured(provider: PushProvider): boolean {
    return this.senders.get(provider)?.configured ?? false;
  }

  async send(message: PushMessage): Promise<DeliveryResult> {
    const sender = this.senders.get(message.provider);
    if (!sender?.configured) return { kind: "transient", code: `${message.provider}_not_configured` };
    return sender.send(message);
  }

  close(): void {
    for (const sender of this.senders.values()) sender.close();
  }
}
