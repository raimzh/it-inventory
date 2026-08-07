import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // getResponse() can be: a string OR { statusCode, message, error }
    // message itself can be a string, array of strings, or array of objects (class-validator)
    const raw = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal server error';

    let message: string;
    if (typeof raw === 'string') {
      // e.g. new HttpException('text', 400)
      message = raw;
    } else if (raw && typeof raw === 'object') {
      const m = (raw as any).message;
      if (typeof m === 'string') {
        // Most common: BadRequestException('some string')
        message = m;
      } else if (Array.isArray(m)) {
        // ValidationPipe errors: m = ['field must not be empty', ...]
        // Each element can be a string or a nested object
        message = m
          .map((item: any) => (typeof item === 'string' ? item : JSON.stringify(item)))
          .join('; ');
      } else if (m && typeof m === 'object') {
        // Nested object — stringify for safety
        message = JSON.stringify(m);
      } else {
        // Fallback: use the raw object or its 'error' key
        message = (raw as any).error || 'Unknown error';
      }
    } else {
      message = String(raw);
    }

    const requestId = (request as any).requestId;

    if (status >= 500) {
      // JSON-строкой: такие логи можно грепать и разбирать машинно,
      // в отличие от свободного текста.
      this.logger.error(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.url,
          status,
          message,
          userId: (request as any).user?.id,
          ip: request.ip,
        }),
        exception instanceof Error ? exception.stack : '',
      );
    }

    response.status(status).json({
      statusCode: status,
      message,                          // always a plain string now
      // Идентификатор запроса отдаём клиенту: пользователь может назвать его
      // при обращении, и запись сразу находится в логах.
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
