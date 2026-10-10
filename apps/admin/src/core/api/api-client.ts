export interface ApiResponse<T = unknown> {
  statusCode: number;
  data: T;
  message?: string;
  error?: string;
}

export class ApiError extends Error {
  statusCode: number;
  data?: unknown;

  constructor(message: string, statusCode: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.data = data;
  }
}

class ApiClient {
  private baseUrl = (() => {
    const customUrl = import.meta.env.VITE_API_URL;
    if (customUrl) {
      return `${String(customUrl).replace(/\/$/, '')}/api/v1`;
    }
    if (import.meta.env.PROD) {
      return 'https://mikrotik-api-yn0e.onrender.com/api/v1';
    }
    return '/api/v1';
  })();

  private getToken(): string | null {
    return localStorage.getItem('mikrotik_auth_token');
  }

  private getRefreshToken(): string | null {
    return localStorage.getItem('mikrotik_refresh_token');
  }

  private getActiveTenantId(): string | null {
    return localStorage.getItem('mikrotik_active_tenant_id');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const tenantId = this.getActiveTenantId();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (tenantId) {
      headers['x-tenant-id'] = tenantId;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle CSV or Blob exports
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/csv')) {
      return (await response.text()) as unknown as T;
    }

    let payload: Record<string, unknown> | null = null;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = null;
    }

    // 401 Unauthorized handling & automatic token refresh
    if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      const refreshToken = this.getRefreshToken();
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ refreshToken }),
          });
          if (refreshRes.ok) {
            const refreshPayload = (await refreshRes.json()) as {
              data?: { accessToken?: string; refreshToken?: string };
              accessToken?: string;
              refreshToken?: string;
            };
            const refreshData = refreshPayload?.data || refreshPayload;
            if (refreshData?.accessToken) {
              localStorage.setItem('mikrotik_auth_token', refreshData.accessToken);
              if (refreshData.refreshToken) {
                localStorage.setItem('mikrotik_refresh_token', refreshData.refreshToken);
              }
              // Retry original request with the renewed token
              const retryHeaders = {
                ...headers,
                Authorization: `Bearer ${refreshData.accessToken}`,
              };
              return this.request<T>(endpoint, { ...options, headers: retryHeaders });
            }
          }
        } catch {
          // Refresh failed
        }
      }

      // If refresh failed or unavailable: clear stale session and notify
      localStorage.removeItem('mikrotik_auth_token');
      localStorage.removeItem('mikrotik_refresh_token');
      localStorage.removeItem('mikrotik_auth_user');
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new ApiError('انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول لمتابعة العمل', 401, payload);
    }

    if (!response.ok) {
      let errorMsg: string | undefined;

      // 1. Check if error is nested inside payload.error (from NestJS HttpExceptionFilter)
      if (payload?.error && typeof payload.error === 'object') {
        const errObj = payload.error as Record<string, unknown>;
        if (Array.isArray(errObj.details) && errObj.details.length > 0) {
          errorMsg = errObj.details.join(' | ');
        } else if (typeof errObj.message === 'string' && errObj.message) {
          errorMsg = errObj.message;
        }
      }

      // 2. Check top-level message or string error (default NestJS responses)
      if (!errorMsg) {
        if (Array.isArray(payload?.message)) {
          errorMsg = payload.message.join(' | ');
        } else if (typeof payload?.message === 'string') {
          errorMsg = payload.message;
        } else if (typeof payload?.error === 'string') {
          errorMsg = payload.error;
        }
      }

      errorMsg = errorMsg || `طلب غير ناجح (رمز الخطأ: ${response.status})`;
      throw new ApiError(errorMsg, response.status, payload);
    }

    // Unwrap NestJS TransformInterceptor data wrapping if present
    if (payload && typeof payload === 'object' && 'data' in payload) {
      return payload.data as T;
    }

    return payload as unknown as T;
  }

  get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      });
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }
    return this.request<T>(url, { method: 'GET' });
  }

  post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
