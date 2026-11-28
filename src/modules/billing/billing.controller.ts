import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AllowWithoutSubscription } from '../../common/decorators/allow-without-subscription.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import {
  ApiCreatedResponseOf,
  ApiOkResponseOf,
  ApiOkResponseOfArray,
} from '../../common/types/api-envelope.decorators';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { CAPTCHA_ACTIONS, RateLimitByIp, RequireCaptcha } from '../security';
import { DEFAULT_INVOICES_LIMIT, MAX_INVOICES_LIMIT } from './billing.constants';
import { BillingService } from './billing.service';
import { BillingConfigResponseDto } from './dto/billing-config-response.dto';
import { BillingInvoiceDto } from './dto/billing-invoice-response.dto';
import { BillingPortalResponseDto } from './dto/billing-portal-response.dto';
import {
  BillingPaymentMethodSummaryDto,
  BillingStatusResponseDto,
} from './dto/billing-status-response.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import { CheckoutSessionResponseDto } from './dto/checkout-session-response.dto';
import { CreateLanguageUnlockCheckoutDto } from './dto/create-language-unlock-checkout.dto';
import { CreateSubscriptionCheckoutDto } from './dto/create-subscription-checkout.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { SetDefaultPaymentMethodDto } from './dto/set-default-payment-method.dto';
import { SetupIntentResponseDto } from './dto/setup-intent-response.dto';
import { WebhookProcessedResponseDto } from './dto/webhook-response.dto';

/**
 * Controlador del módulo de pagos, checkout y gestión de suscripciones Stripe.
 */
@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Expone la configuración pública de facturación y los precios disponibles. */
  @Public()
  @Get('config')
  @ApiOperation({
    summary: 'Get public billing configuration, publishable key, and pricing metadata',
  })
  @ApiOkResponseOf(BillingConfigResponseDto)
  async getConfig(): Promise<ApiResponse<BillingConfigResponseDto>> {
    const config = await this.billing.getPublicConfig();
    return apiOk('Billing configuration', config);
  }

  /** Inicia el checkout de Stripe para contratar un plan de suscripción. */
  @ApiBearerAuth('access-token')
  @AllowWithoutSubscription()
  @RequireCaptcha(CAPTCHA_ACTIONS.BILLING_CHECKOUT)
  @Post('checkout/subscription')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a Stripe Checkout Session for a paid subscription tier',
  })
  @ApiCreatedResponseOf(CheckoutSessionResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid tier or UI mode', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorDto })
  @ApiConflictResponse({
    description: 'User already has an active paid subscription',
    type: ApiErrorDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Stripe billing is not configured on this environment',
    type: ApiErrorDto,
  })
  @ApiTooManyRequestsResponse({ description: 'Too many billing requests', type: ApiErrorDto })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'Optional idempotency key to safely retry payment operations',
  })
  async createSubscriptionCheckout(
    @CurrentUser() current: AuthUser,
    @Body() dto: CreateSubscriptionCheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ApiResponse<CheckoutSessionResponseDto>> {
    const session = await this.billing.createSubscriptionCheckout(current.id, dto, idempotencyKey);
    return apiOk('Subscription checkout session created', session);
  }

  /** Inicia un checkout de pago único para adquirir un crédito de cambio de idioma. */
  @ApiBearerAuth('access-token')
  @RequireCaptcha(CAPTCHA_ACTIONS.BILLING_CHECKOUT)
  @Post('checkout/language-unlock')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a one-time Stripe Checkout Session for a language change credit',
  })
  @ApiCreatedResponseOf(CheckoutSessionResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid request body', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorDto })
  @ApiForbiddenResponse({
    description: 'An active subscription is required',
    type: ApiErrorDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Stripe billing is not configured on this environment',
    type: ApiErrorDto,
  })
  @ApiTooManyRequestsResponse({ description: 'Too many billing requests', type: ApiErrorDto })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'Optional idempotency key to safely retry payment operations',
  })
  async createLanguageUnlockCheckout(
    @CurrentUser() current: AuthUser,
    @Body() dto: CreateLanguageUnlockCheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ApiResponse<CheckoutSessionResponseDto>> {
    const session = await this.billing.createLanguageUnlockCheckout(
      current.id,
      dto,
      idempotencyKey,
    );
    return apiOk('Language unlock checkout session created', session);
  }

  /** Sincroniza una sesión de checkout del usuario y aplica su resultado de forma idempotente. */
  @ApiBearerAuth('access-token')
  @AllowWithoutSubscription()
  @Post('checkout/:sessionId/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Synchronize and fulfill a completed Checkout Session idempotently',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'Stripe Checkout Session ID',
    example: 'cs_test_123',
  })
  @ApiOkResponseOf(BillingStatusResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid checkout session', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorDto })
  @ApiSwaggerResponse({
    status: HttpStatus.PAYMENT_REQUIRED,
    description: 'Payment has not completed yet',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'Checkout session belongs to another user',
    type: ApiErrorDto,
  })
  @ApiTooManyRequestsResponse({ description: 'Too many billing requests', type: ApiErrorDto })
  async syncCheckoutSession(
    @CurrentUser() current: AuthUser,
    @Param('sessionId') sessionId: string,
  ): Promise<ApiResponse<BillingStatusResponseDto>> {
    const status = await this.billing.syncCheckoutSession(current.id, sessionId);
    return apiOk('Checkout session synchronized', status);
  }

  /** Devuelve el plan efectivo, la suscripción y los pagos recientes del usuario autenticado. */
  @ApiBearerAuth('access-token')
  @AllowWithoutSubscription()
  @Get('status')
  @ApiOperation({
    summary: 'Get current Stripe subscription status and recent payment history',
  })
  @ApiOkResponseOf(BillingStatusResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'User not found', type: ApiErrorDto })
  async getStatus(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<BillingStatusResponseDto>> {
    const status = await this.billing.getBillingStatus(current.id);
    return apiOk('Billing status', status);
  }

  /** Cambia el nivel de una suscripción activa y devuelve su estado actualizado. */
  @ApiBearerAuth('access-token')
  @Post('subscription/change-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upgrade or downgrade an active paid Stripe subscription in-app with proration',
  })
  @ApiOkResponseOf(BillingStatusResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid target tier', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorDto })
  @ApiSwaggerResponse({
    status: HttpStatus.PAYMENT_REQUIRED,
    description: 'No active paid subscription exists; use checkout first',
    type: ApiErrorDto,
  })
  @ApiTooManyRequestsResponse({ description: 'Too many billing requests', type: ApiErrorDto })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'Optional idempotency key to safely retry payment operations',
  })
  async changePlan(
    @CurrentUser() current: AuthUser,
    @Body() dto: ChangePlanDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ApiResponse<BillingStatusResponseDto>> {
    const status = await this.billing.changePlan(current.id, dto, idempotencyKey);
    return apiOk('Subscription plan updated', status);
  }

  /** Programa la cancelación de la suscripción al final del periodo vigente. */
  @ApiBearerAuth('access-token')
  @Post('subscription/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Schedule cancellation of the active paid subscription at the end of the billing cycle',
  })
  @ApiOkResponseOf(BillingStatusResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'No active paid subscription found', type: ApiErrorDto })
  @ApiTooManyRequestsResponse({ description: 'Too many billing requests', type: ApiErrorDto })
  async cancelSubscription(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<BillingStatusResponseDto>> {
    const status = await this.billing.cancelSubscription(current.id);
    return apiOk('Subscription scheduled for cancellation at period end', status);
  }

  /** Reactiva una suscripción cuya cancelación al cierre del periodo estaba programada. */
  @ApiBearerAuth('access-token')
  @Post('subscription/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resume a paid subscription scheduled for cancellation before the period ends',
  })
  @ApiOkResponseOf(BillingStatusResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'No resumable active subscription found', type: ApiErrorDto })
  @ApiTooManyRequestsResponse({ description: 'Too many billing requests', type: ApiErrorDto })
  async resumeSubscription(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<BillingStatusResponseDto>> {
    const status = await this.billing.resumeSubscription(current.id);
    return apiOk('Subscription resumed', status);
  }

  /** Crea un SetupIntent para capturar o actualizar el método de pago del usuario. */
  @ApiBearerAuth('access-token')
  @RequireCaptcha(CAPTCHA_ACTIONS.BILLING_SETUP_INTENT)
  @Post('payment-method/setup-intent')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a Stripe SetupIntent to capture or update a payment method in-app',
  })
  @ApiCreatedResponseOf(SetupIntentResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorDto })
  @ApiServiceUnavailableResponse({
    description: 'Stripe billing is not configured on this environment',
    type: ApiErrorDto,
  })
  @ApiTooManyRequestsResponse({ description: 'Too many billing requests', type: ApiErrorDto })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'Optional idempotency key to safely retry payment operations',
  })
  async createSetupIntent(
    @CurrentUser() current: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ApiResponse<SetupIntentResponseDto>> {
    const intent = await this.billing.createSetupIntent(current.id, idempotencyKey);
    return apiOk('Setup intent created', intent);
  }

  /** Asigna como predeterminado un método de pago confirmado y perteneciente al usuario. */
  @ApiBearerAuth('access-token')
  @Post('payment-method/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a confirmed Stripe PaymentMethod as default for future renewals',
  })
  @ApiOkResponseOf(BillingPaymentMethodSummaryDto)
  @ApiBadRequestResponse({ description: 'Invalid payment method payload', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorDto })
  @ApiForbiddenResponse({
    description: 'PaymentMethod belongs to another customer',
    type: ApiErrorDto,
  })
  @ApiTooManyRequestsResponse({ description: 'Too many billing requests', type: ApiErrorDto })
  async setDefaultPaymentMethod(
    @CurrentUser() current: AuthUser,
    @Body() dto: SetDefaultPaymentMethodDto,
  ): Promise<ApiResponse<BillingPaymentMethodSummaryDto>> {
    const summary = await this.billing.setDefaultPaymentMethod(current.id, dto);
    return apiOk('Default payment method updated', summary);
  }

  /** Lista las facturas recientes asociadas a la cuenta autenticada (máx. 100 por página). */
  @ApiBearerAuth('access-token')
  @Get('invoices')
  @ApiOperation({
    summary: 'List recent Stripe invoices for the authenticated user',
    description: `Returns recent Stripe invoices ordered newest-first (default ${DEFAULT_INVOICES_LIMIT}, capped at ${MAX_INVOICES_LIMIT}; supports cursor pagination via startingAfter).`,
  })
  @ApiOkResponseOfArray(BillingInvoiceDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination query', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'User not found', type: ApiErrorDto })
  @ApiTooManyRequestsResponse({ description: 'Too many billing requests', type: ApiErrorDto })
  async listInvoices(
    @CurrentUser() current: AuthUser,
    @Query() query?: ListInvoicesQueryDto,
  ): Promise<ApiResponse<BillingInvoiceDto[]>> {
    const hasPaginationQuery =
      query !== undefined && (query.limit !== undefined || query.startingAfter !== undefined);
    const invoices = hasPaginationQuery
      ? await this.billing.listInvoices(current.id, query)
      : await this.billing.listInvoices(current.id);
    return apiOk('Billing invoices', invoices);
  }

  /** Genera una URL temporal del portal de facturación de Stripe para el usuario. */
  @ApiBearerAuth('access-token')
  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create an optional Stripe Customer Portal session URL',
  })
  @ApiOkResponseOf(BillingPortalResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorDto })
  @ApiTooManyRequestsResponse({ description: 'Too many billing requests', type: ApiErrorDto })
  async createPortal(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<BillingPortalResponseDto>> {
    const portal = await this.billing.createPortalSession(current.id);
    return apiOk('Billing portal session created', portal);
  }

  /** Verifica y procesa el webhook de Stripe usando el cuerpo HTTP sin modificar. */
  @Public()
  @RateLimitByIp({ action: 'billing_webhook', maxRequests: 120, windowMs: 60_000 })
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive and process signed Stripe webhook events',
  })
  @ApiHeader({
    name: 'stripe-signature',
    required: true,
    description: 'Stripe HMAC webhook signature header',
  })
  @ApiOkResponseOf(WebhookProcessedResponseDto)
  @ApiBadRequestResponse({
    description: 'Invalid webhook signature, missing raw body, or payload exceeding 256 KiB',
    type: ApiErrorDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many webhook requests from this IP',
    type: ApiErrorDto,
  })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<ApiResponse<WebhookProcessedResponseDto>> {
    const result = await this.billing.handleWebhook(req.rawBody, signature);
    return apiOk('Webhook processed', result);
  }
}
