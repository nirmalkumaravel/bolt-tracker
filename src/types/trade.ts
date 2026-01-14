export interface Trade {
  id: string;
  created_at: string;
  trade_date: string;
  description: string;
  multiplier: number;
  stake: number;
  outcome: 'win' | 'loss';
  profit_loss: number;
  amount_banked: number;
  roll_pot_after: number;
  bank_total_after: number;
  total_wealth_after: number;
  trade_number: number;
}

export interface TradeFormData {
  trade_date: string;
  description: string;
  multiplier: number;
  stake: number;
  outcome: 'win' | 'loss';
}

export interface Stats {
  rollPot: number;
  bankTotal: number;
  totalWealth: number;
  totalTrades: number;
  wins: number;
  losses: number;
  successRate: number;
}
