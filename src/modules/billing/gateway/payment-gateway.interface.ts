import type { BillingUiMode } from '../billing.constants';

export interface GatewayPriceInfo {
  id: string;
  unitAmount: number | null;
  currency: string;
  interval: string | null;
}

export interface GatewayPaymentMethodSummary {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export interface GatewaySubscription {
  id: string;
  customerId: string;
  priceId: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  metadata: Record<string, string>;
  defaultPaymentMethod: GatewayPaymentMethodSummary | string | null;
}

export interface GatewayCheckoutSession {
  id: string;
  mode: string;
  status: string | null;
  paymentStatus: string;
  clientSecret: string | null;
  url: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
  metadata: Record<string, string>;
}

export interface GatewaySetupIntent {
  id: string;
  clientSecret: string | null;
  customerId: string | null;
}

export interface GatewayInvoice {
  id: string;
  number: string | null;
  status: string | null;
  amountPaidCents: number;
  amountDueCents: number;
  currency: string;
  createdAt: Date;
  invoicePdfUrl: string | null;
  hostedInvoiceUrl: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  metadata: Record<string, string>;
}

export interface GatewayWebhookEvent {
  id: string;
  type: string;
  envTag: string | null;
  checkoutSession?: GatewayCheckoutSession;
  subscription?: GatewaySubscription;
  invoice?: GatewayInvoice;
}

export interface CreateCustomerInput {
  email: string;
  name?: string | null;
  metadata: Record<string, string>;
  idempotencyKey?: string;
}

export interface CreateCheckoutSessionInput {
  customerId: string;
  mode: 'subscription' | 'payment';
  priceId: string;
  uiMode: BillingUiMode;
  locale?: string | null;
  returnUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata: Record<string, string>;
  subscriptionMetadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface UpdateSubscriptionPlanInput {
  subscriptionId: string;
  newPriceId: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface SetSubscriptionCancelInput {
  subscriptionId: string;
  cancelAtPeriodEnd: boolean;
}

export interface AttachDefaultPaymentMethodInput {
  customerId: string;
  paymentMethodId: string;
  subscriptionId?: string | null;
}

/**
 * Puerto abstracto para desacoplar la lógica de cobro y suscripciones del SDK concreto de Stripe.
 */
export interface PaymentGateway {
  createCustomer(input: CreateCustomerInput): Promise<{ id: string }>;
  retrievePrice(priceId: string): Promise<GatewayPriceInfo>;
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<GatewayCheckoutSession>;
  retrieveCheckoutSession(sessionId: string): Promise<GatewayCheckoutSession>;
  retrieveSubscription(subscriptionId: string): Promise<GatewaySubscription>;
  updateSubscriptionPlan(input: UpdateSubscriptionPlanInput): Promise<GatewaySubscription>;
  setSubscriptionCancelAtPeriodEnd(input: SetSubscriptionCancelInput): Promise<GatewaySubscription>;
  createSetupIntent(input: {
    customerId: string;
    metadata: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<GatewaySetupIntent>;
  attachAndSetDefaultPaymentMethod(
    input: AttachDefaultPaymentMethodInput,
  ): Promise<GatewayPaymentMethodSummary>;
  listInvoices(input: { customerId: string; limit?: number }): Promise<GatewayInvoice[]>;
  createBillingPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  constructWebhookEvent(rawBody: Buffer, signature: string): GatewayWebhookEvent;
}
