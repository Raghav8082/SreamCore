import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import  {Prisma, PrismaClient} from '@prisma/client';
import { Request, Response } from 'express';

import { PinoLogger } from 'nestjs-pino';


@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(GlobalExceptionFilter.name);
  }
 

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const requestId = (request as any).requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();
      if (typeof responseBody === 'string') {
        message = responseBody;
      } else if (typeof responseBody === 'object' && responseBody !== null) {
        message = (responseBody as any).message || (responseBody as any).error || JSON.stringify(responseBody);
      }
  } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const targets = (exception.meta as any)?.target;
          message = targets
            ? `Unique constraint failed on field: ${Array.isArray(targets) ? targets.join(', ') : targets}`
            : 'Unique constraint failed';
          break;
        }
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = exception.message || 'Record not found';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'A database error occurred';
          break;
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Database validation failed';
    } else if (
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError ||
      exception instanceof Prisma.PrismaClientRustPanicError
    ) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'A database error occurred';
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const logPayload = {
      requestId,
      method: request.method,
      url: request.url,
      status,
    };

    if (status >= 500) {
      this.logger.error(
        { ...logPayload, err: exception },
        `Unhandled error on ${request.method} ${request.url}`,
      );
    } else {
      this.logger.warn(
        logPayload,
        `Handled error on ${request.method} ${request.url}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    });
  }
}