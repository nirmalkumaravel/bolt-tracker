import { useEffect, useState } from 'react';
import { Brain, Sparkles } from 'lucide-react';

interface RelaxationModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

const RELAXATION_TIPS = [
  "Take a deep breath. Trading requires a clear mind.",
  "Remember: Discipline beats emotion every time.",
  "One trade at a time. Focus on the process, not the outcome.",
  "Winners plan their trades and trade their plan.",
  "Stay patient. The market rewards those who wait.",
  "Risk management is your best friend.",
  "Don't chase losses. Stick to your strategy.",
  "Celebrate wins, learn from losses.",
  "Every trade is a lesson, not just a result.",
  "Stay calm, stay focused, stay profitable.",
  "The best traders know when NOT to trade.",
  "Your mindset is your greatest asset.",
  "Consistency compounds over time.",
  "Trust your analysis, trust your plan.",
  "Take breaks. Fresh minds make better decisions."
];

export default function RelaxationModal({ isOpen, onComplete }: RelaxationModalProps) {
  const [seconds, setSeconds] = useState(30);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setSeconds(30);
      setCurrentTipIndex(0);
      return;
    }

    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const tipTimer = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % RELAXATION_TIPS.length);
    }, 3000);

    return () => {
      clearInterval(timer);
      clearInterval(tipTimer);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const progress = ((30 - seconds) / 30) * 100;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-purple-900/95 via-blue-900/95 to-indigo-900/95 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-white/20 animate-scaleIn">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="relative">
              <Brain className="w-16 h-16 text-cyan-300 animate-pulse" />
              <Sparkles className="w-8 h-8 text-yellow-300 absolute -top-2 -right-2 animate-spin-slow" />
            </div>
          </div>

          <h2 className="text-3xl font-bold text-white">
            Take a Breath
          </h2>

          <div className="relative">
            <div className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-300 to-purple-300 animate-pulse">
              {seconds}
            </div>
            <div className="text-sm text-cyan-200 mt-2">seconds remaining</div>
          </div>

          <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 transition-all duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="min-h-[120px] flex items-center justify-center">
            <p className="text-lg text-cyan-100 font-medium animate-fadeIn px-4 leading-relaxed">
              {RELAXATION_TIPS[currentTipIndex]}
            </p>
          </div>

          <button
            onClick={onComplete}
            disabled={seconds > 0}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition-all duration-300 transform ${
              seconds > 0
                ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 text-white hover:scale-105 hover:shadow-lg hover:shadow-purple-500/50 animate-pulse'
            }`}
          >
            {seconds > 0 ? 'Relaxing...' : 'Complete Relaxation ✨'}
          </button>
        </div>
      </div>
    </div>
  );
}
