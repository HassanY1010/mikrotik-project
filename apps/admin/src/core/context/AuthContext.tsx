import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../api/api-client';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'OPERATOR' | 'CASHIER' | 'AUDITOR';
  tenantId?: string;
  tenantName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  activeTenantId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchTenant: (tenantId: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('mikrotik_auth_token');
    const savedUser = localStorage.getItem('mikrotik_auth_user');
    const savedTenant = localStorage.getItem('mikrotik_active_tenant_id');

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        const parsedUser = JSON.parse(savedUser) as AuthUser;
        setUser(parsedUser);
        setActiveTenantId(savedTenant || parsedUser.tenantId || null);
      } catch {
        localStorage.removeItem('mikrotik_auth_token');
        localStorage.removeItem('mikrotik_auth_user');
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      logout();
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiClient.post<{ accessToken: string; refreshToken?: string; user: AuthUser }>('/auth/login', {
      email,
      password,
    });

    const authToken = res.accessToken;
    const authUser = res.user;

    localStorage.setItem('mikrotik_auth_token', authToken);
    if (res.refreshToken) {
      localStorage.setItem('mikrotik_refresh_token', res.refreshToken);
    }
    localStorage.setItem('mikrotik_auth_user', JSON.stringify(authUser));

    setToken(authToken);
    setUser(authUser);

    if (authUser.tenantId) {
      localStorage.setItem('mikrotik_active_tenant_id', authUser.tenantId);
      setActiveTenantId(authUser.tenantId);
    }
  };

  const logout = () => {
    localStorage.removeItem('mikrotik_auth_token');
    localStorage.removeItem('mikrotik_refresh_token');
    localStorage.removeItem('mikrotik_auth_user');
    localStorage.removeItem('mikrotik_active_tenant_id');
    setToken(null);
    setUser(null);
    setActiveTenantId(null);
  };

  const switchTenant = (tenantId: string) => {
    localStorage.setItem('mikrotik_active_tenant_id', tenantId);
    setActiveTenantId(tenantId);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        activeTenantId,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
        switchTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
