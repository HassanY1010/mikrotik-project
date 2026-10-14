import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/api-client';
import { useAuth } from './AuthContext';
import { TenantSettingsItem } from '../types/view-models';

export interface SubscriptionInfo {
  plan: string;
  planNameAr?: string;
  maxRouters: number;
  maxCardsPerMonth: number | null;
  usedCards?: number;
  remainingCards?: number | null;
  isUnlimited?: boolean;
  cycleStart?: string | null;
  cycleEnd?: string | null;
  status: string;
  startsAt?: string | null;
  expiresAt: string | null;
}

interface SubscriptionContextValue {
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
  isSubscribed: boolean;
  isExpired: boolean;
  isSuspended: boolean;
  hasNoSubscription: boolean;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, activeTenantId } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchSubscription = useCallback(async () => {
    // If not authenticated or super admin without tenant, skip
    if (!isAuthenticated) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    // Super Admin platform operator viewing system overview
    if (user?.role === 'SUPER_ADMIN' && !activeTenantId) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiClient.get<TenantSettingsItem>('/tenants/current');
      if (res && res.subscription) {
        setSubscription(res.subscription);
      } else {
        setSubscription({
          plan: 'NONE',
          planNameAr: 'لا يوجد اشتراك',
          maxRouters: 0,
          maxCardsPerMonth: 0,
          usedCards: 0,
          remainingCards: 0,
          isUnlimited: false,
          status: 'NONE',
          expiresAt: null,
        });
      }
    } catch {
      setSubscription({
        plan: 'NONE',
        planNameAr: 'لا يوجد اشتراك',
        maxRouters: 0,
        maxCardsPerMonth: 0,
        usedCards: 0,
        remainingCards: 0,
        isUnlimited: false,
        status: 'NONE',
        expiresAt: null,
      });
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user, activeTenantId]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const isExpired = Boolean(
    subscription?.status === 'EXPIRED' ||
      (subscription?.expiresAt &&
        new Date(subscription.expiresAt).getTime() <= Date.now() &&
        subscription?.status !== 'NONE'),
  );

  const isSuspended = subscription?.status === 'SUSPENDED';

  const hasNoSubscription = Boolean(
    !subscription || subscription.status === 'NONE' || subscription.plan === 'NONE',
  );

  const isSubscribed = Boolean(
    subscription &&
      subscription.status === 'ACTIVE' &&
      !isExpired &&
      !isSuspended &&
      !hasNoSubscription,
  );

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        isLoading,
        isSubscribed,
        isExpired,
        isSuspended,
        hasNoSubscription,
        refreshSubscription: fetchSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = (): SubscriptionContextValue => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
