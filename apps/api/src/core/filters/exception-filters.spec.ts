import { ArgumentsHost, ConflictException, HttpStatus, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './http-exception.filter';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createMockHost(url = '/api/v1/devices', method = 'POST') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = {
    url,
    method,
    headers: { 'x-request-id': 'req-123' },
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('Exception Filters (Mobile & Client Error Compatibility)', () => {
  describe('HttpExceptionFilter', () => {
    const filter = new HttpExceptionFilter();

    it('emits both top-level message and nested error object while preserving custom domain code', () => {
      const { host, status, json } = createMockHost('/api/v1/devices');
      const exception = new ConflictException({
        code: 'DEVICE_EXISTS',
        message: 'الراوتر بالعنوان 192.168.1.147 والمنفذ 8728 مسجل مسبقاً لهذا الحساب',
      });

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'الراوتر بالعنوان 192.168.1.147 والمنفذ 8728 مسجل مسبقاً لهذا الحساب',
          error: expect.objectContaining({
            code: 'DEVICE_EXISTS',
            message: 'الراوتر بالعنوان 192.168.1.147 والمنفذ 8728 مسجل مسبقاً لهذا الحساب',
          }),
          requestId: 'req-123',
        }),
      );
    });

    it('joins array validation messages into both top-level message and error.message', () => {
      const { host, status, json } = createMockHost('/api/v1/devices');
      const exception = new BadRequestException({
        error: 'Bad Request',
        message: ['host should not be empty', 'name must be a string'],
      });

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'host should not be empty | name must be a string',
          error: expect.objectContaining({
            code: 'BAD_REQUEST',
            message: 'host should not be empty | name must be a string',
            details: ['host should not be empty', 'name must be a string'],
          }),
        }),
      );
    });
  });

  describe('AllExceptionsFilter', () => {
    it('maps Prisma P2002 errors with top-level message alongside error payload', () => {
      const configService = { get: jest.fn().mockReturnValue('production') } as unknown as ConfigService;
      const filter = new AllExceptionsFilter(configService);
      const { host, status, json } = createMockHost('/api/v1/devices/123', 'PATCH');

      const prismaError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      filter.catch(prismaError, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'يوجد سجل مسبق بنفس الاسم أو البيانات المدخلة في النظام',
          error: expect.objectContaining({
            code: 'UNIQUE_CONSTRAINT_FAILED',
            message: 'يوجد سجل مسبق بنفس الاسم أو البيانات المدخلة في النظام',
          }),
        }),
      );
    });
  });
});
