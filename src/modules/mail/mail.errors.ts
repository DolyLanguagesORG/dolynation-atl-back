/**
 * Errores propios del servicio de correo.
 *
 * El detalle real del fallo (credenciales, respuesta del proveedor) **nunca**
 * llega al cliente: este error solo se registra en el log del servidor y la
 * API responde con un código estable del catálogo de errores.
 */

/**
 * Error de entrega de correo.
 *
 * Se lanza cuando el transporte SMTP no puede enviar el mensaje. El mensaje es
 * deliberadamente genérico para no filtrar información del proveedor.
 */
export class MailDeliveryError extends Error {
  constructor(message = 'Failed to send email') {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

/**
 * Error de configuración de correo.
 *
 * Se lanza cuando faltan variables de entorno necesarias para usar el
 * transporte. El mensaje nombra la variable que falta para que el error sea
 * accionable en el log del servidor (nunca se expone al cliente).
 */
export class MailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailConfigurationError';
  }
}

/**
 * Describe un error de transporte sin exponer su mensaje.
 *
 * nodemailer etiqueta los fallos de SMTP con un código estable (`EAUTH`,
 * `ECONNECTION`, `ETIMEDOUT`…), que es justo lo que hace falta para
 * diagnosticar sin filtrar el contenido crudo del error a los logs.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code ? `${error.name} (${code})` : error.name;
  }
  return 'error desconocido';
}
