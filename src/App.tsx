// RelaxationModal.tsx (drop-in scroll-safe)
import React, { useEffect, useMemo, useState } from 'react';
import { Brain, Sparkles, CheckCircle2, XCircle } from 'lucide-react';

interface RelaxationModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

const RELAXATION_TIPS = [
  'Take a deep breath. Trading requires a clear mind.',
  'Remember: Discipline beats emotion every time.',
  'One trade at a time. Focus on the process, not the outcome.',
  'Winners plan their trades and trade their plan.',
  'Stay patient. The market rewards those who wait.',
  'Risk management is your best friend.',
  "Don't chase losses. Stick to your strategy.",
  'Celebrate wins, learn from losses.',
  'Every trade is a lesson, not just a result.',
  'Stay calm, stay focused, stay profitable.',
  'The best traders know when NOT to trade.',
  'Your mindset is your greatest asset.',
  'Consistency compounds over time.',
  'Trust your analysis, trust your plan.',
  'Take breaks. Fresh minds make better decisions.',
];

type Answer = 'yes' | 'no' | null;

type CheckQuestion = { id: string; text: string };

const CHECK_QUESTIONS: CheckQuestion[] = [
  { id: 'calm', text: 'I feel calm and steady right now.' },
  { id: 'plan', text: 'I have a clear plan and I will follow it.' },
  { id: 'risk', text: 'I know my risk (stake/stop) before entering.' },
  { id: 'no_revenge', text: 'I am not trying to recover a loss (no revenge trading).' },
  { id: 'ok_to_skip', text: 'I am okay skipping this trade if conditions are not perfect.' },
];

export default function RelaxationModal({ isOpen, onComplete }: RelaxationModalProps) {
  const [seconds, setSeconds] = useState(30);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [stage, setStage] = useState<'timer' | 'checklist'>('timer');

  const [answers, setAnswers] = useState<Record<string, Answer>>({
    calm: null,
    plan: null,
    risk: null,
    no_revenge: null,
    ok_to_skip: null,
  });

  useEffect(() => {
    if (!isOpen) {
      setSeconds(30);
      setCurrentTipIndex(0);
      setStage('timer');
      setAnswers({ calm: null, plan: null, risk: null, no_revenge: null, ok_to_skip: null });
      return;
    }

    setStage('timer');
    setSeconds(30);

    const timer = window.setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const tipTimer = window.setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % RELAXATION_TIPS.length);
    }, 3000);

    return () => {
      window.clearInterval(timer);
      window.clearInterval(tipTimer);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (seconds === 0) setStage('checklist');
  }, [seconds, isOpen]);

  const progress = ((30 - seconds) / 30) * 100;

  const allAnswered = useMemo(
    () => CHECK_QUESTIONS.every((q) => answers[q.id] !== null),
    [answers]
  );

  const yesCount = useMemo(
    () => CHECK_QUESTIONS.reduce((acc, q) => acc + (answers[q.id] === 'yes' ? 1 : 0), 0),
    [answers]
  );

  const canComplete = stage === 'checklist' && allAnswered && yesCount >= 4;

  function setAnswer(id: string, value: Answer) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-gradient-to-br from-purple-900/95 via-blue-900/95 to-indigo-900/95 backdrop-blur-sm overflow-y-auto touch-pan-y"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="min-h-full w-full flex items-start justify-center p-4 py-10">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-white/20 animate-scaleIn">
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="relative">
                <Brain className="w-16 h-16 text-cyan-300 animate-pulse" />
                <Sparkles className="w-8 h-8 text-yellow-300 absolute -top-2 -right-2 animate-spin-slow" />
              </div>
            </div>

            {stage === 'timer' ? (
              <>
                <h2 className="text-3xl font-bold text-white">Take a Breath</h2>

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
                  disabled
                  className="w-full py-4 rounded-xl font-semibold text-lg transition-all duration-300 bg-gray-500/50 text-gray-300 cursor-not-allowed"
                >
                  Relaxing...
                </button>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-bold text-white">Quick Clarity Check</h2>
                <p className="text-cyan-100/90 text-sm leading-relaxed">
                  Answer honestly. You can proceed only if you complete all questions and have at least{' '}
                  <span className="font-semibold text-white">4 out of 5</span> “Yes”.
                </p>

                <div className="space-y-3 text-left">
                  {CHECK_QUESTIONS.map((q) => {
                    const val = answers[q.id];
                    return (
                      <div key={q.id} className="rounded-2xl bg-white/10 border border-white/15 p-4">
                        <div className="text-white font-medium">{q.text}</div>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAnswer(q.id, 'yes')}
                            className={`flex-1 py-2 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                              val === 'yes'
                                ? 'bg-emerald-500 text-white shadow-lg'
                                : 'bg-white/10 text-white/80 hover:bg-white/15'
                            }`}
                          >
                            <CheckCircle2 className="w-5 h-5" />
                            Yes
                          </button>

                          <button
                            type="button"
                            onClick={() => setAnswer(q.id, 'no')}
                            className={`flex-1 py-2 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                              val === 'no'
                                ? 'bg-rose-500 text-white shadow-lg'
                                : 'bg-white/10 text-white/80 hover:bg-white/15'
                            }`}
                          >
                            <XCircle className="w-5 h-5" />
                            No
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-sm text-cyan-100/90">
                  <div>
                    Yes count: <span className="font-semibold text-white">{yesCount}</span>/5
                  </div>
                  <div>
                    Status:{' '}
                    <span className={`font-semibold ${canComplete ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {canComplete ? 'Ready' : 'Not Ready'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={onComplete}
                  disabled={!canComplete}
                  className={`w-full py-4 rounded-xl font-semibold text-lg transition-all duration-300 transform ${
                    !canComplete
                      ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 text-white hover:scale-105 hover:shadow-lg hover:shadow-purple-500/50'
                  }`}
                >
                  {canComplete ? 'Complete Check ✓' : allAnswered ? 'Need 4+ Yes to Proceed' : 'Answer All Questions'}
                </button>

                {!canComplete && allAnswered && (
                  <div className="text-xs text-cyan-100/80 leading-relaxed">
                    If you got multiple “No”, consider skipping the next trade or reducing stake size.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
