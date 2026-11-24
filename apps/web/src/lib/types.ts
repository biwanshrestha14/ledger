export type TxType = 'expense' | 'income' | 'transfer';
export type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'investment';

export interface User { id: string; email: string; name: string; currency: string; locale: string; createdAt: string }
export interface Account {
  id: string; name: string; type: AccountType; color: string; openingBalance: number;
  balance: number; archived: boolean; transactionCount: number;
}
export interface Category { id: string; name: string; kind: 'expense' | 'income'; color: string; icon: string; archived: boolean }
export interface Transaction {
  id: string; type: TxType; amount: number; date: string; payee: string; note: string;
  accountId: string; toAccountId: string | null; categoryId: string | null;
  categoryName: string | null; categoryColor: string | null; categoryIcon: string | null;
  accountName: string; accountColor: string; toAccountName: string | null;
}
export interface TxPage { items: Transaction[]; total: number; income: number; expense: number; limit: number; offset: number }
export interface Budget { id: string; amount: number; categoryId: string; categoryName: string; categoryColor: string; categoryIcon: string; spent: number }
export interface Goal { id: string; name: string; target: number; saved: number; targetDate: string | null; color: string }
export interface Recurring {
  id: string; name: string; type: 'expense' | 'income'; amount: number; accountId: string; categoryId: string | null;
  cadence: 'weekly' | 'monthly' | 'yearly'; nextDate: string; categoryName: string | null; categoryColor: string | null;
  categoryIcon: string | null; accountName: string;
}
export interface Overview {
  month: string; netWorth: number; assets: number; liabilities: number; income: number; expense: number; net: number;
  savingsRate: number | null; previous: { month: string; income: number; expense: number };
  byCategory: { categoryId: string | null; name: string; color: string; icon: string; amount: number; count: number }[];
  topPayees: { payee: string; amount: number; count: number }[];
  trend: { month: string; income: number; expense: number; netWorth: number }[];
  daily: { current: number[]; previous: number[]; dayOfMonth: number };
  upcoming: { id: string; name: string; type: string; amount: number; nextDate: string; cadence: string; categoryColor: string | null; categoryIcon: string | null }[];
}
export interface Payee { payee: string; type: TxType; categoryId: string | null; accountId: string; uses: number }
