import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, user, ip, headers } = req;

    const writeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (!writeMethod) return next.handle();

    return next.handle().pipe(
      tap(async () => {
        if (user) {
          const resource = url.split('/')[1];
          const actions: Record<string, string> = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
          const action = actions[method] || method.toLowerCase();
          await this.auditService.log({
            userId: user.id, username: user.username,
            action, resource,
            ipAddress: ip || headers['x-forwarded-for'],
            userAgent: headers['user-agent'],
          }).catch(() => {});
        }
      }),
    );
  }
}
