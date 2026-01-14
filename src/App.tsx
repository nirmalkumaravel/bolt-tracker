import { useEffect, useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Target,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  Wallet,
  PiggyBank,
  Trophy
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { Trade, TradeFormData, Stats } from './types/trade';
import RelaxationModal from './components/RelaxationModal';

const STARTING_ROLL_POT = 0;
const STARTING_BANK_TOTAL = 3000;
const TARGET_GOAL = 20000;

function App() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<Stats>({
    rollPot: STARTING_ROLL_POT,
    bankTotal: STARTING_BANK_TOTAL,
    totalWealth: STARTING_ROLL_POT,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    successRate: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showRelaxation, setShowRelaxation] = useState(false);
  const [formData, setFormData] = useState<TradeFormData>({
    trade_date: new Date().toISOString().split('T')[0],
    description: '',
    multiplier: 2.0,
    stake: 0,
    outcome: 'win',
  });

  useEffect(() => {
    loadTrades();
  }, []);

  async function loadTrades() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .order('trade_number', { ascending: false });

    if (error) {
      console.error('Error loading trades:', error);
    } else if (data) {
      setTrades(data);
      calculateStats(data);
    }
    setIsLoading(false);
  }

  function calculateStats(tradesList: Trade[]) {
    if (tradesList.length === 0) {
      setStats({
        rollPot: STARTING_ROLL_POT,
        bankTotal: STARTING_BANK_TOTAL,
        totalWealth: STARTING_ROLL_POT,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        successRate: 0,
      });
      return;
    }

    const latestTrade = tradesList[0];
    const wins = tradesList.filter(t => t.outcome === 'win').length;
    const losses = tradesList.filter(t => t.outcome === 'loss').length;
    const successRate = tradesList.length > 0 ? (wins / tradesList.length) * 100 : 0;

    setStats({
      rollPot: latestTrade.roll_pot_after,
      bankTotal: latestTrade.bank_total_after,
      totalWealth: latestTrade.total_wealth_after,
      totalTrades: tradesList.length,
      wins,
      losses,
      successRate,
    });
  }

  async function handleAddTrade(e: React.FormEvent) {
    e.preventDefault();

    if (formData.stake > stats.bankTotal) {
      alert('Stake cannot exceed Roll Pot balance!');
      return;
    }

    if (formData.stake <= 0) {
      alert('Stake must be greater than 0!');
      return;
    }
  // Stake comes out of BANK (not Roll Pot) and moves into Roll Pot as capital-at-risk
  let newRollPot = stats.rollPot + formData.stake;
  let newBankTotal = stats.bankTotal - formData.stake;
  
  let profitLoss = 0;
  let amountBanked = 0;
  
  if (formData.outcome === 'win') {
    const totalReturn = formData.stake * formData.multiplier;
    profitLoss = totalReturn - formData.stake; // profit only
  
    // Split PROFIT: 70% stays in Roll Pot, 30% goes back to Bank
    const rollPotProfit = profitLoss * 0.7;
    amountBanked = profitLoss * 0.3;
  
    newRollPot += rollPotProfit;
    newBankTotal += amountBanked;
  } else {
    // Loss: stake is already removed from bank and moved to roll pot; now burn it from roll pot
    profitLoss = -formData.stake;
    newRollPot -= formData.stake;
  }

    const newTotalWealth = newRollPot + newBankTotal;
    const tradeNumber = trades.length + 1;

    const newTrade = {
      trade_date: formData.trade_date,
      description: formData.description,
      multiplier: formData.multiplier,
      stake: formData.stake,
      outcome: formData.outcome,
      profit_loss: profitLoss,
      amount_banked: amountBanked,
      roll_pot_after: newRollPot,
      bank_total_after: newBankTotal,
      total_wealth_after: newTotalWealth,
      trade_number: tradeNumber,
    };

    const { error } = await supabase.from('trades').insert([newTrade]);

    if (error) {
      console.error('Error adding trade:', error);
      alert('Failed to add trade');
    } else {
      setFormData({
        trade_date: new Date().toISOString().split('T')[0],
        description: '',
        multiplier: 2.0,
        stake: 0,
        outcome: 'win',
      });
      setShowForm(false);
      setShowRelaxation(true);
      await loadTrades();
    }
  }

  async function handleReset() {
    if (!confirm('Are you sure you want to reset all data? This cannot be undone.')) {
      return;
    }

    const { error } = await supabase.from('trades').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.error('Error resetting trades:', error);
      alert('Failed to reset data');
    } else {
      await loadTrades();
    }
  }

  const progressPercentage = (stats.totalWealth / TARGET_GOAL) * 100;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center">
        <div className="text-white text-2xl animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 p-4 pb-20">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="text-center py-6 animate-fadeIn">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 flex items-center justify-center gap-3">
              <TrendingUp className="w-10 h-10" />
              Trading Tracker
            </h1>
            <p className="text-blue-100 text-lg">Master Your Trades, Secure Your Future</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl p-6 shadow-xl transform hover:scale-105 transition-all duration-300 animate-slideInLeft">
              <div className="flex items-center justify-between mb-2">
                <Wallet className="w-8 h-8 text-white" />
                <div className="text-white/80 text-sm font-medium">Roll Pot</div>
              </div>
              <div className="text-3xl md:text-4xl font-bold text-white">
                ${stats.rollPot.toFixed(2)}
              </div>
              <div className="text-white/80 text-sm mt-1">Trading Capital</div>
            </div>

            <div className="bg-gradient-to-br from-green-400 to-emerald-600 rounded-2xl p-6 shadow-xl transform hover:scale-105 transition-all duration-300 animate-slideInUp">
              <div className="flex items-center justify-between mb-2">
                <PiggyBank className="w-8 h-8 text-white" />
                <div className="text-white/80 text-sm font-medium">Bank Total</div>
              </div>
              <div className="text-3xl md:text-4xl font-bold text-white">
                ${stats.bankTotal.toFixed(2)}
              </div>
              <div className="text-white/80 text-sm mt-1">Secured Funds</div>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl p-6 shadow-xl transform hover:scale-105 transition-all duration-300 animate-slideInRight">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-8 h-8 text-white" />
                <div className="text-white/80 text-sm font-medium">Total Wealth</div>
              </div>
              <div className="text-3xl md:text-4xl font-bold text-white">
                ${stats.totalWealth.toFixed(2)}
              </div>
              <div className="text-white/80 text-sm mt-1">Combined Value</div>
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur rounded-2xl p-6 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="w-6 h-6 text-purple-600" />
                <span className="font-semibold text-gray-800">Goal Progress</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-purple-600">
                  ${stats.totalWealth.toFixed(0)}
                </div>
                <div className="text-sm text-gray-600">of ${TARGET_GOAL.toLocaleString()}</div>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 transition-all duration-1000 ease-out flex items-center justify-end pr-2"
                style={{ width: `${Math.min(progressPercentage, 100)}%` }}
              >
                {progressPercentage >= 10 && (
                  <span className="text-white text-xs font-bold">
                    {progressPercentage.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/95 backdrop-blur rounded-xl p-4 shadow-lg transform hover:scale-105 transition-all">
              <div className="text-gray-600 text-sm mb-1">Total Trades</div>
              <div className="text-2xl font-bold text-gray-800">{stats.totalTrades}</div>
            </div>
            <div className="bg-white/95 backdrop-blur rounded-xl p-4 shadow-lg transform hover:scale-105 transition-all">
              <div className="text-green-600 text-sm mb-1 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Wins
              </div>
              <div className="text-2xl font-bold text-green-600">{stats.wins}</div>
            </div>
            <div className="bg-white/95 backdrop-blur rounded-xl p-4 shadow-lg transform hover:scale-105 transition-all">
              <div className="text-red-600 text-sm mb-1 flex items-center gap-1">
                <XCircle className="w-4 h-4" /> Losses
              </div>
              <div className="text-2xl font-bold text-red-600">{stats.losses}</div>
            </div>
            <div className="bg-white/95 backdrop-blur rounded-xl p-4 shadow-lg transform hover:scale-105 transition-all">
              <div className="text-purple-600 text-sm mb-1 flex items-center gap-1">
                <Trophy className="w-4 h-4" /> Success Rate
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {stats.successRate.toFixed(1)}%
              </div>
            </div>
          </div>

          {showForm && (
            <div className="bg-white/95 backdrop-blur rounded-2xl p-6 shadow-xl animate-scaleIn">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Add New Trade</h2>
              <form onSubmit={handleAddTrade} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={formData.trade_date}
                    onChange={(e) => setFormData({ ...formData, trade_date: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="e.g., BTC Long Position"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Multiplier (Odds)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1.01"
                      value={formData.multiplier}
                      onChange={(e) => setFormData({ ...formData, multiplier: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Stake Amount ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={stats.bankTotal}
                      value={formData.stake || ''}
                      onChange={(e) => setFormData({ ...formData, stake: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Outcome
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, outcome: 'win' })}
                      className={`py-3 px-4 rounded-lg font-semibold transition-all ${
                        formData.outcome === 'win'
                          ? 'bg-green-500 text-white shadow-lg scale-105'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      <CheckCircle className="w-5 h-5 inline mr-2" />
                      Win
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, outcome: 'loss' })}
                      className={`py-3 px-4 rounded-lg font-semibold transition-all ${
                        formData.outcome === 'loss'
                          ? 'bg-red-500 text-white shadow-lg scale-105'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      <XCircle className="w-5 h-5 inline mr-2" />
                      Loss
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-purple-500 to-pink-600 text-white py-3 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-700 transform hover:scale-105 transition-all shadow-lg"
                  >
                    Add Trade
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-6 bg-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-400 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {!showForm && (
            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(true)}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 rounded-xl font-semibold text-lg hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all shadow-xl flex items-center justify-center gap-2"
              >
                <Plus className="w-6 h-6" />
                Add New Trade
              </button>
              <button
                onClick={handleReset}
                className="px-6 bg-red-500 text-white py-4 rounded-xl font-semibold hover:bg-red-600 transform hover:scale-105 transition-all shadow-xl"
              >
                <RefreshCw className="w-6 h-6" />
              </button>
            </div>
          )}

          {trades.length > 0 && (
            <div className="bg-white/95 backdrop-blur rounded-2xl p-6 shadow-xl animate-fadeIn">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Trade History</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-3 px-2 font-semibold text-gray-700">#</th>
                      <th className="text-left py-3 px-2 font-semibold text-gray-700">Date</th>
                      <th className="text-left py-3 px-2 font-semibold text-gray-700">Description</th>
                      <th className="text-right py-3 px-2 font-semibold text-gray-700">Stake</th>
                      <th className="text-right py-3 px-2 font-semibold text-gray-700">Mult.</th>
                      <th className="text-right py-3 px-2 font-semibold text-gray-700">P/L</th>
                      <th className="text-right py-3 px-2 font-semibold text-gray-700">Banked</th>
                      <th className="text-right py-3 px-2 font-semibold text-gray-700">Roll Pot</th>
                      <th className="text-right py-3 px-2 font-semibold text-gray-700">Bank</th>
                      <th className="text-right py-3 px-2 font-semibold text-gray-700">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => (
                      <tr
                        key={trade.id}
                        className="border-b border-gray-200 hover:bg-purple-50 transition-colors"
                      >
                        <td className="py-3 px-2 font-medium">{trade.trade_number}</td>
                        <td className="py-3 px-2 text-gray-600">
                          {new Date(trade.trade_date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-2 text-gray-800">{trade.description}</td>
                        <td className="py-3 px-2 text-right font-medium">
                          ${trade.stake.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-right">{trade.multiplier.toFixed(2)}x</td>
                        <td className={`py-3 px-2 text-right font-bold ${
                          trade.outcome === 'win' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-right text-green-600 font-medium">
                          ${trade.amount_banked.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-right font-medium">
                          ${trade.roll_pot_after.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-right font-medium">
                          ${trade.bank_total_after.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-purple-600">
                          ${trade.total_wealth_after.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <RelaxationModal
        isOpen={showRelaxation}
        onComplete={() => setShowRelaxation(false)}
      />
    </>
  );
}

export default App;
