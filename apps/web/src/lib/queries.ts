import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { Account, Budget, Category, Goal, Overview, Payee, Recurring, TxPage, User } from './types';

export const keys = {
  me: ['me'] as const,
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  tx: ['transactions'] as const,
  payees: ['payees'] as const,
  budgets: ['budgets'] as const,
  goals: ['goals'] as const,
  recurring: ['recurring'] as const,
  overview: ['overview'] as const,
};

export const useMe = () =>
  useQuery({
    queryKey: keys.me,
    queryFn: () => api<User>('/auth/me').catch((e) => {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }),
    retry: false,
    staleTime: Infinity,
  });
export const useAccounts = () => useQuery({ queryKey: keys.accounts, queryFn: () => api<Account[]>('/accounts') });
export const useCategories = () => useQuery({ queryKey: keys.categories, queryFn: () => api<Category[]>('/categories'), staleTime: 60_000 });
export const usePayees = () => useQuery({ queryKey: keys.payees, queryFn: () => api<Payee[]>('/transactions/payees'), staleTime: 60_000 });
export const useBudgets = (month: string) =>
  useQuery({ queryKey: [...keys.budgets, month], queryFn: () => api<Budget[]>(`/budgets?month=${month}`), placeholderData: keepPreviousData });
export const useGoals = () => useQuery({ queryKey: keys.goals, queryFn: () => api<Goal[]>('/goals') });
export const useRecurring = () => useQuery({ queryKey: keys.recurring, queryFn: () => api<Recurring[]>('/recurring') });
export const useOverview = (month: string) =>
  useQuery({ queryKey: [...keys.overview, month], queryFn: () => api<Overview>(`/insights/overview?month=${month}`), placeholderData: keepPreviousData });

export interface TxFilters { q?: string; accountId?: string; categoryId?: string; type?: string; from?: string; to?: string; limit?: number }
export const useTransactions = (f: TxFilters) => {
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined && v !== '') as [string, string][]);
  return useQuery({
    queryKey: [...keys.tx, f],
    queryFn: () => api<TxPage>(`/transactions?${params}`),
    placeholderData: keepPreviousData,
  });
};

/** Anything that changes money invalidates every derived view. */
export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [keys.tx, keys.accounts, keys.budgets, keys.overview, keys.payees, keys.recurring, keys.goals, keys.categories].map((k) =>
        qc.invalidateQueries({ queryKey: k }),
      ),
    );
}

export function useMoneyMutation<TVars, TResult = unknown>(fn: (v: TVars) => Promise<TResult>) {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate() });
}
