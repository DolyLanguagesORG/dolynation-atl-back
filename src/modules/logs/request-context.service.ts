import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContextStore } from './logs.types';

/** Información mínima del actor autenticado adjuntada al contexto activo. */
export interface RequestActorInfo {
  id: number;
  email?: string | null;
  role?: string | null;
}

/**
 * Almacena y expone el contexto de la petición HTTP en curso usando `AsyncLocalStorage`,
 * permitiendo que cualquier servicio de dominio registre `requestId`, IP, `User-Agent`,
 * actor y duración sin contaminar sus firmas públicas.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  /** Ejecuta un callback dentro de un nuevo contexto de petición aislado. */
  run<T>(store: RequestContextStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }

  /** Devuelve el contexto activo de la petición actual o `undefined` fuera de una petición HTTP. */
  get(): RequestContextStore | undefined {
    return this.storage.getStore();
  }

  /** Devuelve el `requestId` de la petición en curso si existe. */
  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  /** Adjunta la identidad del actor autenticado al contexto de la petición actual. */
  setActor(actor: RequestActorInfo): void {
    const store = this.storage.getStore();
    if (!store) return;
    store.actorUserId = actor.id;
    if (actor.email !== undefined) {
      store.actorEmail = actor.email;
    }
    if (actor.role !== undefined) {
      store.actorRole = actor.role;
    }
  }

  /** Registra el código de estado HTTP resultante en el contexto de la petición actual. */
  setHttpStatus(status: number): void {
    const store = this.storage.getStore();
    if (!store) return;
    store.httpStatus = status;
  }

  /** Calcula la duración transcurrida en milisegundos desde el inicio de la petición actual. */
  getDurationMs(): number | null {
    const store = this.storage.getStore();
    if (!store) return null;
    return Math.max(0, Date.now() - store.startedAt);
  }
}
