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
  private baseUrl = import.meta.env.VITE_API_URL
    ? `${String(import.meta.env.VITE_API_URL).replace(/\/$/, '')}/api/v1`
    : '/api/v1';

  private getToken(): string | null {
    return localStorage.getItem('mikrotik_auth_token');
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

    if (!response.ok) {
      const errorMsg =
        (typeof payload?.message === 'string' ? payload.message : null) ||
        (typeof payload?.error === 'string' ? payload.error : null) ||
        `طلب غير ناجح (رمز الخطأ: ${response.status})`;
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
