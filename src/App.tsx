// App.tsx (FULL UPDATED - drop-in)
// Notes:
// ✅ Uses trades.created_at for time-series aggregation (hourly/daily/weekly)
// ✅ Displays created_at in America/Chicago time (CST/CDT automatically)
// ✅ Fixes your dailySummary bug (you were grouping by full timestamp instead of day)
// ✅ Removes common TS/JS pitfalls (fmtMoney, stable date bucketing, tooltip formatting)

import React, { useEffect, useMemo, useState } from 'react';
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
  Trophy,
  Pencil,
  Undo2,
  BarChart3,
  LayoutGrid,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { Trade, TradeFormData, Stats } from './types/trade';
import RelaxationModal from './components/RelaxationModal';

// Recharts
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const STARTING_ROLL_POT = 0;
const STARTING_BANK_TOTAL = 3000;
const TARGET_GOAL = 20000;

// Mini goals every 4 hours
const MINI_GOAL_HOURS = 4;
const DEFAULT_MINI_COMPOUND_RATE = 0.02; // 2% every 4 hours (adjustable in UI)

// Optional snapshots table name
const SNAPSHOT_TABLE = 'wealth_snapshots';

type TabKey = 'dashboard' | 'analytics';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Chicago time formatting (handles CST/CDT automatically)
const CHICAGO_TZ = 'America/Chicago';

function formatChicagoDateTime(iso: string | null | undefined) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString(undefined, {
    timeZone: CHICAGO_TZ,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatChicagoDateOnly(iso: string | null | undefined) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString(undefined, { timeZone: CHICAGO_TZ, year: 'numeric', month: 'short', day: '2-digit' });
}

function nextFourHourBoundary(now: Date, stepHours = 4) {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  const hour = d.getHours();
  const next = Math.ceil((hour + 0.0001) / stepHours) * stepHours;
  if (next >= 24) {
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setHours(next, 0, 0, 0);
  }
  return d;
}

function msToHMS(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Bucketing by created_at in Chicago timezone
function bucketKey(iso: string, granularity: 'hour' | 'day' | 'week') {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'invalid';

  // Convert to Chicago “wall time” components (stable for bucketing)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const yyyy = get('year');
  const mm = get('month');
  const dd = get('day');
  const hh = get('hour');
  const weekday = get('weekday'); // Mon, Tue, ...

  if (granularity === 'hour') return `${yyyy}-${mm}-${dd} ${hh}:00`;
  if (granularity === 'day') return `${yyyy}-${mm}-${dd}`;

  // week: Monday-start week key
  // Create a Chicago-local Date by reconstructing an ISO-like string; then shift to Monday.
  // This is sufficient for chart grouping; DST-safe because we’re using date-only math.
  const localMidnight = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  const day = localMidnight.getDay(); // 0 Sun..6 Sat (in browser local tz)
  // We want Monday = 1
  const diffToMon = (day + 6) % 7;
  localMidnight.setDate(localMidnight.getDate() - diffToMon);

  // format Monday date as key
  const wk = localMidnight.toISOString().slice(0, 10);
  return `Week of ${wk}`;
}

function bucketLabel(key: string, granularity: 'hour' | 'day' | 'week') {
  if (key === 'invalid') return 'Invalid';
  if (granularity === 'hour') return key; // already readable
  if (granularity === 'day') return key;
  return key; // "Week of YYYY-MM-DD"
}

function applyTradeMath(
  prevRoll: number,
  prevBank: number,
  stake: number,
  multiplier: number,
  outcome: 'win' | 'loss'
) {
  const isSeedingTrade = prevRoll <= 0;

  if (stake <= 0) return { ok: false as const, reason: 'Stake must be > 0' };
  if (multiplier <= 1) return { ok: false as const, reason: 'Multiplier must be > 1' };

  if (isSeedingTrade) {
    if (stake > prevBank) return { ok: false as const, reason: 'Stake cannot exceed Bank balance' };
  } else {
    if (stake > prevRoll) return { ok: false as const, reason: 'Stake cannot exceed Roll Pot balance' };
  }

  const totalReturn = outcome === 'win' ? stake * multiplier : 0;

  const bankAllocation = outcome === 'win' ? totalReturn * 0.3 : 0;
  const rollAllocation = outcome === 'win' ? totalReturn * 0.7 : 0;

  let newRoll = prevRoll;
  let newBank = prevBank;

  if (outcome === 'win') {
    if (isSeedingTrade) {
      newBank = prevBank - stake + bankAllocation;
      newRoll = prevRoll + rollAllocation;
    } else {
      newBank = prevBank + bankAllocation;
      newRoll = prevRoll - stake + rollAllocation;
    }
  } else {
    if (isSeedingTrade) {
      newBank = prevBank - stake;
      newRoll = prevRoll;
    } else {
      newRoll = prevRoll - stake;
      newBank = prevBank;
    }
  }

  const profitLoss = outcome === 'win' ? totalReturn - stake : -stake;
  const amountBanked = bankAllocation;
  const totalWealth = newRoll + newBank;

  return {
    ok: true as const,
    newRoll,
    newBank,
    totalWealth,
    profitLoss,
    amountBanked,
  };
}

export default function App() {
  const [tab, setTab] = useState<TabKey>('dashboard');

  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<Stats>({
    rollPot: STARTING_ROLL_POT,
    bankTotal: STARTING_BANK_TOTAL,
    totalWealth: STARTING_ROLL_POT + STARTING_BANK_TOTAL,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    successRate: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showRelaxation, setShowRelaxation] = useState(false);

  // Add trade form
  const [formData, setFormData] = useState<TradeFormData>({
    trade_date: new Date().toISOString().split('T')[0],
    description: '',
    multiplier: 2.0,
    stake: 0,
    outcome: 'win',
  });

  // Edit trade modal
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [editData, setEditData] = useState<TradeFormData>({
    trade_date: new Date().toISOString().split('T')[0],
    description: '',
    multiplier: 2.0,
    stake: 0,
    outcome: 'win',
  });

  // Mini-goals
  const [miniRate, setMiniRate] = useState(DEFAULT_MINI_COMPOUND_RATE);
  const [miniCountdown, setMiniCountdown] = useState('00:00:00');

  // Analytics granularity
  const [agg, setAgg] = useState<'hour' | 'day' | 'week'>('day');

  useEffect(() => {
    loadTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mini-goal countdown tick
  useEffect(() => {
    const t = window.setInterval(() => {
      const now = new Date();
      const next = nextFourHourBoundary(now, MINI_GOAL_HOURS);
      setMiniCountdown(msToHMS(next.getTime() - now.getTime()));
    }, 500);

    return () => window.clearInterval(t);
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
      setTrades(data as Trade[]);
      calculateStats(data as Trade[]);
    }
    setIsLoading(false);

    // Optional snapshots insert attempt
    void maybeCaptureSnapshot();
  }

  function calculateStats(tradesList: Trade[]) {
    if (!tradesList || tradesList.length === 0) {
      setStats({
        rollPot: STARTING_ROLL_POT,
        bankTotal: STARTING_BANK_TOTAL,
        totalWealth: STARTING_ROLL_POT + STARTING_BANK_TOTAL,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        successRate: 0,
      });
      return;
    }

    const latest = tradesList[0];
    const wins = tradesList.filter((t) => t.outcome === 'win').length;
    const losses = tradesList.filter((t) => t.outcome === 'loss').length;
    const successRate = tradesList.length > 0 ? (wins / tradesList.length) * 100 : 0;

    setStats({
      rollPot: Number(latest.roll_pot_after ?? 0),
      bankTotal: Number(latest.bank_total_after ?? 0),
      totalWealth: Number(latest.total_wealth_after ?? 0),
      totalTrades: tradesList.length,
      wins,
      losses,
      successRate,
    });
  }

  async function fetchTradesAsc(): Promise<Trade[]> {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .order('trade_number', { ascending: true });

    if (error) {
      console.error('Error fetching trades asc:', error);
      return [];
    }
    return (data ?? []) as Trade[];
  }

  function recomputeAll(tradesAsc: Trade[]) {
    let roll = STARTING_ROLL_POT;
    let bank = STARTING_BANK_TOTAL;

    const updated: Trade[] = [];

    for (let i = 0; i < tradesAsc.length; i++) {
      const t = tradesAsc[i];

      const stake = Number(t.stake);
      const mult = Number(t.multiplier);
      const outcome = t.outcome as 'win' | 'loss';

      const res = applyTradeMath(roll, bank, stake, mult, outcome);
      if (!res.ok) {
        return { ok: false as const, reason: `Trade #${i + 1}: ${res.reason}` };
      }

      roll = res.newRoll;
      bank = res.newBank;

      updated.push({
        ...t,
        trade_number: i + 1,
        profit_loss: res.profitLoss,
        amount_banked: res.amountBanked,
        roll_pot_after: res.newRoll,
        bank_total_after: res.newBank,
        total_wealth_after: res.totalWealth,
      });
    }

    return { ok: true as const, updated };
  }

  async function persistTrades(updatedTradesAsc: Trade[]) {
    const payload = updatedTradesAsc.map((t) => ({
      id: t.id,
      // keep created_at unchanged (do NOT overwrite)
      trade_date: t.trade_date,
      description: t.description,
      multiplier: t.multiplier,
      stake: t.stake,
      outcome: t.outcome,
      profit_loss: t.profit_loss,
      amount_banked: t.amount_banked,
      roll_pot_after: t.roll_pot_after,
      bank_total_after: t.bank_total_after,
      total_wealth_after: t.total_wealth_after,
      trade_number: t.trade_number,
    }));

    const { error } = await supabase.from('trades').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('Error upserting recomputed trades:', error);
      alert('Failed to recompute and save trades. Check console.');
      return false;
    }
    return true;
  }

  async function recomputeAndReload() {
    const asc = await fetchTradesAsc();
    const rec = recomputeAll(asc);
    if (!rec.ok) {
      alert(`Cannot recompute: ${rec.reason}`);
      return;
    }
    const ok = await persistTrades(rec.updated);
    if (ok) await loadTrades();
  }

  async function handleAddTrade(e: React.FormEvent) {
    e.preventDefault();

    const stake = Number(formData.stake);
    const multiplier = Number(formData.multiplier);

    const res = applyTradeMath(stats.rollPot, stats.bankTotal, stake, multiplier, formData.outcome);
    if (!res.ok) {
      alert(res.reason);
      return;
    }

    const tradeNumber = trades.length + 1;

    const newTrade = {
      // ✅ explicit timestamp stored in UTC, displayed in Chicago time
      created_at: new Date().toISOString(),
      trade_date: formData.trade_date,
      description: formData.description,
      multiplier,
      stake,
      outcome: formData.outcome,
      profit_loss: res.profitLoss,
      amount_banked: res.amountBanked,
      roll_pot_after: res.newRoll,
      bank_total_after: res.newBank,
      total_wealth_after: res.totalWealth,
      trade_number: tradeNumber,
    };

    const { error } = await supabase.from('trades').insert([newTrade]);

    if (error) {
      console.error('Error adding trade:', error);
      alert('Failed to add trade');
      return;
    }

    setFormData({
      trade_date: new Date().toISOString().split('T')[0],
      description: '',
      multiplier: 2.0,
      stake: 0,
      outcome: 'win',
    });
    setShowForm(false);
    setShowRelaxation(true);

    await recomputeAndReload();
  }

  async function handleUndoLastTrade() {
    if (!trades || trades.length === 0) return;

    const latest = trades[0];
    if (!confirm(`Undo last trade (#${latest.trade_number})? This will delete it.`)) return;

    const { error } = await supabase.from('trades').delete().eq('id', latest.id);
    if (error) {
      console.error('Error undoing trade:', error);
      alert('Failed to undo last trade');
      return;
    }

    await recomputeAndReload();
  }

  function openEdit(trade: Trade) {
    setEditingTrade(trade);
    setEditData({
      trade_date: trade.trade_date,
      description: trade.description,
      multiplier: Number(trade.multiplier),
      stake: Number(trade.stake),
      outcome: trade.outcome as 'win' | 'loss',
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTrade) return;

    const asc = await fetchTradesAsc();
    const updatedBase = asc.map((t) => {
      if (t.id !== editingTrade.id) return t;
      return {
        ...t,
        trade_date: editData.trade_date,
        description: editData.description,
        multiplier: Number(editData.multiplier),
        stake: Number(editData.stake),
        outcome: editData.outcome,
      };
    });

    const rec = recomputeAll(updatedBase);
    if (!rec.ok) {
      alert(`Edit not allowed: ${rec.reason}`);
      return;
    }

    const ok = await persistTrades(rec.updated);
    if (!ok) return;

    setEditingTrade(null);
    await loadTrades();
  }

  async function handleReset() {
    if (!confirm('Are you sure you want to reset all data? This cannot be undone.')) return;

    const { error } = await supabase
      .from('trades')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.error('Error resetting trades:', error);
      alert('Failed to reset data');
      return;
    }

    await loadTrades();
  }

  // Optional: 4-hour snapshots (safe if table missing)
  async function maybeCaptureSnapshot() {
    try {
      const now = new Date();
      const boundary = nextFourHourBoundary(now, MINI_GOAL_HOURS);

      const { data: lastRows, error: lastErr } = await supabase
        .from(SNAPSHOT_TABLE)
        .select('*')
        .order('captured_at', { ascending: false })
        .limit(1);

      if (lastErr) return; // ignore missing table

      const last = (lastRows?.[0] as any) || null;
      const lastTs = last?.captured_at ? new Date(last.captured_at).getTime() : 0;

      const prevBoundary = new Date(boundary);
      prevBoundary.setHours(prevBoundary.getHours() - MINI_GOAL_HOURS);

      if (!last || lastTs < prevBoundary.getTime()) {
        const payload = {
          captured_at: now.toISOString(),
          roll_pot: stats.rollPot,
          bank_total: stats.bankTotal,
          total_wealth: stats.totalWealth,
        };
        await supabase.from(SNAPSHOT_TABLE).insert([payload]);
      }
    } catch {
      // ignore
    }
  }

  const progressPercentage = (stats.totalWealth / TARGET_GOAL) * 100;

  // Mini goal amount for next 4-hour block
  const miniGoal = useMemo(() => {
    const rate = clamp(miniRate, 0, 0.25);
    return stats.totalWealth * (1 + rate);
  }, [miniRate, stats.totalWealth]);

  // ===== ANALYTICS DATA =====
  const tradesAscForCharts = useMemo(() => {
    return [...trades].sort((a, b) => Number(a.trade_number) - Number(b.trade_number));
  }, [trades]);

  const chartByTrade = useMemo(() => {
    return tradesAscForCharts.map((t) => ({
      x: `#${t.trade_number}`,
      trade_number: t.trade_number,
      created_at: (t as any).created_at,
      created_at_chicago: formatChicagoDateTime((t as any).created_at),
      total: Number(t.total_wealth_after ?? 0),
      roll: Number(t.roll_pot_after ?? 0),
      bank: Number(t.bank_total_after ?? 0),
      pl: Number(t.profit_loss ?? 0),
      outcome: t.outcome,
    }));
  }, [tradesAscForCharts]);

  const winLossPie = useMemo(() => {
    const wins = trades.filter((t) => t.outcome === 'win').length;
    const losses = trades.filter((t) => t.outcome === 'loss').length;
    return [
      { name: 'Wins', value: wins },
      { name: 'Losses', value: losses },
    ];
  }, [trades]);

  // ✅ Corrected aggregation: bucket by created_at into hour/day/week
  const timeSummary = useMemo(() => {
    const map = new Map<string, { key: string; label: string; pl: number; trades: number; wins: number; losses: number }>();

    for (const t of tradesAscForCharts) {
      const createdAt = (t as any).created_at as string | undefined;
      if (!createdAt) continue;

      const key = bucketKey(createdAt, agg);
      const label = bucketLabel(key, agg);

      const cur = map.get(key) ?? { key, label, pl: 0, trades: 0, wins: 0, losses: 0 };
      cur.pl += Number(t.profit_loss ?? 0);
      cur.trades += 1;
      if (t.outcome === 'win') cur.wins += 1;
      else cur.losses += 1;

      map.set(key, cur);
    }

    return Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
  }, [tradesAscForCharts, agg]);

  // Pie colors
  const PIE_COLORS = ['#22c55e', '#ef4444'];

  // Tooltip formatting for charts
  const tooltipFormatter = (value: any, name: any) => {
    if (typeof value === 'number') return [fmtMoney(value), name];
    return [String(value), name];
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center">
        <div className="text-white text-2xl animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 p-4 pb-24">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center py-6 animate-fadeIn">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 flex items-center justify-center gap-3">
              <TrendingUp className="w-10 h-10" />
              Trading Tracker
            </h1>
            <p className="text-blue-100 text-lg">Master Your Trades, Secure Your Future</p>
          </div>

          {/* Tabs */}
          <div className="flex justify-center">
            <div className="bg-white/15 backdrop-blur rounded-2xl p-1 shadow-xl border border-white/20 flex gap-1">
              <button
                onClick={() => setTab('dashboard')}
                className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${
                  tab === 'dashboard'
                    ? 'bg-white text-gray-900 shadow'
                    : 'text-white/90 hover:bg-white/10'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Dashboard
              </button>
              <button
                onClick={() => setTab('analytics')}
                className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${
                  tab === 'analytics'
                    ? 'bg-white text-gray-900 shadow'
                    : 'text-white/90 hover:bg-white/10'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Analytics
              </button>
            </div>
          </div>

          {tab === 'dashboard' ? (
            <>
              {/* Top 3 summary cards */}
              <div className="grid grid-cols-3 gap-2 md:gap-4">
                <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full md:rounded-2xl p-3 md:p-6 shadow-xl transform hover:scale-105 transition-all duration-300 animate-slideInLeft">
                  <div className="flex items-center justify-center">
                    <Wallet className="w-6 h-6 md:w-8 md:h-8 text-white" />
                  </div>
                  <div className="text-center mt-1 md:mt-2">
                    <div className="text-xs md:text-3xl font-bold text-white">
                      ${fmtMoney(stats.rollPot)}
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-400 to-emerald-600 rounded-full md:rounded-2xl p-3 md:p-6 shadow-xl transform hover:scale-105 transition-all duration-300 animate-slideInUp">
                  <div className="flex items-center justify-center">
                    <PiggyBank className="w-6 h-6 md:w-8 md:h-8 text-white" />
                  </div>
                  <div className="text-center mt-1 md:mt-2">
                    <div className="text-xs md:text-3xl font-bold text-white">
                      ${fmtMoney(stats.bankTotal)}
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-full md:rounded-2xl p-3 md:p-6 shadow-xl transform hover:scale-105 transition-all duration-300 animate-slideInRight">
                  <div className="flex items-center justify-center">
                    <DollarSign className="w-6 h-6 md:w-8 md:h-8 text-white" />
                  </div>
                  <div className="text-center mt-1 md:mt-2">
                    <div className="text-xs md:text-3xl font-bold text-white">
                      ${fmtMoney(stats.totalWealth)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Goal Progress */}
              <div className="bg-white/95 backdrop-blur rounded-3xl p-5 md:p-6 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-purple-100 flex items-center justify-center">
                      <Target className="w-5 h-5 text-purple-700" />
                    </div>
                    <div className="leading-tight">
                      <div className="text-sm font-semibold text-gray-800">Goal Progress</div>
                      <div className="text-[11px] text-gray-600">
                        ${stats.totalWealth.toFixed(0)} of ${TARGET_GOAL.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg md:text-2xl font-extrabold text-purple-700">
                      {Math.min(progressPercentage, 100).toFixed(1)}%
                    </div>
                    <div className="text-[11px] text-gray-500">completed</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="relative w-full h-4 md:h-5 rounded-full bg-gray-200 overflow-hidden shadow-inner">
                    <div className="absolute inset-0 opacity-40 animate-pulse bg-gradient-to-r from-white/0 via-white/50 to-white/0" />
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 transition-all duration-1000 ease-out shadow-[0_0_18px_rgba(236,72,153,0.35)]"
                      style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2"
                      style={{ left: `calc(${Math.min(progressPercentage, 100)}% - 10px)` }}
                    >
                      <div className="relative">
                        <div className="w-5 h-5 rounded-full bg-white shadow-md border border-purple-200" />
                        <div className="absolute inset-0 w-5 h-5 rounded-full bg-purple-400/40 animate-ping" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex justify-between text-[10px] text-gray-500">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              {/* Mini goal every 4 hours (compounding) */}
              <div className="bg-white/95 backdrop-blur rounded-3xl p-5 md:p-6 shadow-xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">
                      Mini Goal (every {MINI_GOAL_HOURS} hours)
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Next checkpoint in <span className="font-semibold text-gray-800">{miniCountdown}</span>
                    </div>
                    <div className="mt-3 text-2xl font-extrabold text-gray-900">
                      Target: ${miniGoal.toFixed(0)}
                    </div>
                    <div className="text-xs text-gray-600">
                      Current: ${stats.totalWealth.toFixed(0)} &nbsp;•&nbsp; Gap:{' '}
                      <span
                        className={
                          stats.totalWealth >= miniGoal
                            ? 'text-emerald-700 font-semibold'
                            : 'text-rose-700 font-semibold'
                        }
                      >
                        ${Math.max(0, miniGoal - stats.totalWealth).toFixed(0)}
                      </span>
                    </div>
                  </div>

                  <div className="w-44">
                    <label className="text-xs font-semibold text-gray-700">Compounding rate</label>
                    <div className="text-[11px] text-gray-600 mb-1">
                      {Math.round(miniRate * 100)}% / {MINI_GOAL_HOURS}h
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.1}
                      step={0.005}
                      value={miniRate}
                      onChange={(e) => setMiniRate(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>0%</span>
                      <span>10%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Compact stat circles */}
              <div className="w-full overflow-x-auto">
                <div className="flex items-center gap-2 md:gap-3 min-w-[320px] justify-between">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg flex flex-col items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    <div className="text-white font-extrabold text-sm md:text-lg leading-none mt-1">
                      {stats.totalTrades}
                    </div>
                    <span className="sr-only">Total Trades</span>
                  </div>

                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg flex flex-col items-center justify-center shrink-0">
                    <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    <div className="text-white font-extrabold text-sm md:text-lg leading-none mt-1">
                      {stats.wins}
                    </div>
                    <span className="sr-only">Wins</span>
                  </div>

                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-rose-500 to-red-600 shadow-lg flex flex-col items-center justify-center shrink-0">
                    <XCircle className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    <div className="text-white font-extrabold text-sm md:text-lg leading-none mt-1">
                      {stats.losses}
                    </div>
                    <span className="sr-only">Losses</span>
                  </div>

                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 shadow-lg flex flex-col items-center justify-center shrink-0">
                    <Trophy className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    <div className="text-white font-extrabold text-[11px] md:text-base leading-none mt-1">
                      {stats.successRate.toFixed(0)}%
                    </div>
                    <span className="sr-only">Win Percentage</span>
                  </div>
                </div>
              </div>

              {/* Add/Undo/Reset controls */}
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
                    onClick={handleUndoLastTrade}
                    disabled={trades.length === 0}
                    className={`px-6 py-4 rounded-xl font-semibold transform transition-all shadow-xl flex items-center justify-center ${
                      trades.length === 0
                        ? 'bg-gray-400/60 text-white/70 cursor-not-allowed'
                        : 'bg-white/20 text-white hover:bg-white/30 hover:scale-105'
                    }`}
                    title="Undo last trade"
                  >
                    <Undo2 className="w-6 h-6" />
                  </button>

                  <button
                    onClick={handleReset}
                    className="px-6 bg-red-500 text-white py-4 rounded-xl font-semibold hover:bg-red-600 transform hover:scale-105 transition-all shadow-xl"
                    title="Reset all trades"
                  >
                    <RefreshCw className="w-6 h-6" />
                  </button>
                </div>
              )}

              {/* Add Trade Form */}
              {showForm && (
                <div className="bg-white/95 backdrop-blur rounded-2xl p-6 shadow-xl animate-scaleIn">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Add New Trade</h2>
                  <form onSubmit={handleAddTrade} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={formData.trade_date}
                        onChange={(e) => setFormData({ ...formData, trade_date: e.target.value })}
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
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
                          onChange={(e) =>
                            setFormData({ ...formData, multiplier: parseFloat(e.target.value) })
                          }
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
                          max={stats.rollPot > 0 ? stats.rollPot : stats.bankTotal}
                          value={formData.stake || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, stake: parseFloat(e.target.value) })
                          }
                          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Outcome</label>
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

              {/* Trade History */}
              {trades.length > 0 && (
                <div className="bg-white/95 backdrop-blur rounded-2xl p-6 shadow-xl animate-fadeIn">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">Trade History</h2>
                    <button
                      onClick={recomputeAndReload}
                      className="text-sm font-semibold px-3 py-2 rounded-lg bg-gray-900/5 hover:bg-gray-900/10 transition"
                      title="Recompute all trades"
                    >
                      Recompute
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-300">
                          <th className="text-left py-3 px-2 font-semibold text-gray-700">#</th>
                          <th className="text-left py-3 px-2 font-semibold text-gray-700">Time (Chicago)</th>
                          <th className="text-left py-3 px-2 font-semibold text-gray-700">Trade Date</th>
                          <th className="text-left py-3 px-2 font-semibold text-gray-700">Description</th>
                          <th className="text-right py-3 px-2 font-semibold text-gray-700">Stake</th>
                          <th className="text-right py-3 px-2 font-semibold text-gray-700">Mult.</th>
                          <th className="text-right py-3 px-2 font-semibold text-gray-700">P/L</th>
                          <th className="text-right py-3 px-2 font-semibold text-gray-700">Banked</th>
                          <th className="text-right py-3 px-2 font-semibold text-gray-700">Roll Pot</th>
                          <th className="text-right py-3 px-2 font-semibold text-gray-700">Bank</th>
                          <th className="text-right py-3 px-2 font-semibold text-gray-700">Total</th>
                          <th className="text-right py-3 px-2 font-semibold text-gray-700">Edit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((trade) => (
                          <tr
                            key={trade.id}
                            className="border-b border-gray-200 hover:bg-purple-50 transition-colors"
                          >
                            <td className="py-3 px-2 font-medium">{trade.trade_number}</td>

                            {/* ✅ created_at displayed in Chicago time */}
                            <td className="py-3 px-2 text-gray-600 whitespace-nowrap">
                              {formatChicagoDateTime((trade as any).created_at)}
                            </td>

                            <td className="py-3 px-2 text-gray-600 whitespace-nowrap">
                              {new Date(trade.trade_date).toLocaleDateString()}
                            </td>

                            <td className="py-3 px-2 text-gray-800">{trade.description}</td>

                            <td className="py-3 px-2 text-right font-medium">
                              ${fmtMoney(Number(trade.stake))}
                            </td>

                            <td className="py-3 px-2 text-right">{Number(trade.multiplier).toFixed(2)}x</td>

                            <td
                              className={`py-3 px-2 text-right font-bold ${
                                trade.outcome === 'win' ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {(Number(trade.profit_loss) >= 0 ? '+' : '') + '$' + fmtMoney(Number(trade.profit_loss))}
                            </td>

                            <td className="py-3 px-2 text-right text-green-600 font-medium">
                              ${fmtMoney(Number(trade.amount_banked))}
                            </td>

                            <td className="py-3 px-2 text-right font-medium">
                              ${fmtMoney(Number(trade.roll_pot_after))}
                            </td>

                            <td className="py-3 px-2 text-right font-medium">
                              ${fmtMoney(Number(trade.bank_total_after))}
                            </td>

                            <td className="py-3 px-2 text-right font-bold text-purple-600">
                              ${fmtMoney(Number(trade.total_wealth_after))}
                            </td>

                            <td className="py-3 px-2 text-right">
                              <button
                                onClick={() => openEdit(trade)}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gray-900/5 hover:bg-gray-900/10 transition"
                                title="Edit trade"
                              >
                                <Pencil className="w-4 h-4 text-gray-700" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-xs text-gray-600 mt-3">
                    Times shown are converted from UTC to <span className="font-semibold">America/Chicago</span>.
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* ANALYTICS */}
              <div className="bg-white/95 backdrop-blur rounded-3xl p-4 shadow-xl">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm font-semibold text-gray-800">Time Aggregation</div>
                  <div className="flex gap-2">
                    {(['hour', 'day', 'week'] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setAgg(k)}
                        className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                          agg === k ? 'bg-gray-900 text-white' : 'bg-gray-900/5 hover:bg-gray-900/10 text-gray-800'
                        }`}
                      >
                        {k.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Total Wealth line */}
                <div className="bg-white/95 backdrop-blur rounded-3xl p-5 shadow-xl">
                  <div className="text-sm font-semibold text-gray-800 mb-3">Total Wealth</div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartByTrade}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="x" />
                        <YAxis />
                        <Tooltip formatter={tooltipFormatter} />
                        <Line type="monotone" dataKey="total" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Roll vs Bank area */}
                <div className="bg-white/95 backdrop-blur rounded-3xl p-5 shadow-xl">
                  <div className="text-sm font-semibold text-gray-800 mb-3">Roll Pot vs Bank</div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartByTrade}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="x" />
                        <YAxis />
                        <Tooltip formatter={tooltipFormatter} />
                        <Area type="monotone" dataKey="roll" strokeWidth={2} fillOpacity={0.25} />
                        <Area type="monotone" dataKey="bank" strokeWidth={2} fillOpacity={0.25} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Profit/Loss bars */}
                <div className="bg-white/95 backdrop-blur rounded-3xl p-5 shadow-xl">
                  <div className="text-sm font-semibold text-gray-800 mb-3">Profit / Loss by Trade</div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartByTrade}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="x" />
                        <YAxis />
                        <Tooltip formatter={tooltipFormatter} />
                        <Bar dataKey="pl" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Win/Loss pie */}
                <div className="bg-white/95 backdrop-blur rounded-3xl p-5 shadow-xl">
                  <div className="text-sm font-semibold text-gray-800 mb-3">Win vs Loss</div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={winLossPie}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={95}
                          label
                        >
                          {winLossPie.map((_, idx) => (
                            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Time summary (hour/day/week) */}
                <div className="bg-white/95 backdrop-blur rounded-3xl p-5 shadow-xl lg:col-span-2">
                  <div className="text-sm font-semibold text-gray-800 mb-3">
                    {agg.toUpperCase()} Profit/Loss Summary (by created_at in Chicago time)
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timeSummary}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip formatter={tooltipFormatter} />
                        <Bar dataKey="pl" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-xs text-gray-600 mt-2">
                    Buckets are computed using <span className="font-semibold">America/Chicago</span> time.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingTrade && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-lg font-bold text-gray-900">Edit Trade</div>
                <div className="text-xs text-gray-600">Trade #{editingTrade.trade_number}</div>
              </div>
              <button
                onClick={() => setEditingTrade(null)}
                className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition text-sm font-semibold"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={editData.trade_date}
                  onChange={(e) => setEditData({ ...editData, trade_date: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Multiplier</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1.01"
                    value={editData.multiplier}
                    onChange={(e) => setEditData({ ...editData, multiplier: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stake</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editData.stake || ''}
                    onChange={(e) => setEditData({ ...editData, stake: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Outcome</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setEditData({ ...editData, outcome: 'win' })}
                    className={`py-3 px-4 rounded-lg font-semibold transition-all ${
                      editData.outcome === 'win'
                        ? 'bg-green-500 text-white shadow-lg scale-105'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    <CheckCircle className="w-5 h-5 inline mr-2" />
                    Win
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditData({ ...editData, outcome: 'loss' })}
                    className={`py-3 px-4 rounded-lg font-semibold transition-all ${
                      editData.outcome === 'loss'
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
                  Save & Recompute
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTrade(null)}
                  className="px-6 bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-all"
                >
                  Cancel
                </button>
              </div>

              <div className="text-xs text-gray-600">
                Note: editing recalculates all following trades to keep Roll/Bank correct.
              </div>
            </form>
          </div>
        </div>
      )}

      <RelaxationModal isOpen={showRelaxation} onComplete={() => setShowRelaxation(false)} />
    </>
  );
}
