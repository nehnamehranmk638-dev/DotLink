import React, { useState } from 'react';
import {
  RemediationGame,
  MOCK_CONFIGS,
  THEMES,
  COMPANIONS,
  useRemediationFlow
} from '../../remediation';

export default function RemediationDev() {
  const [selectedConfigIndex, setSelectedConfigIndex] = useState(0);
  const [activeConfig, setActiveConfig] = useState(MOCK_CONFIGS[0]);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [lastLog, setLastLog] = useState(null);

  // Hook test state
  const {
    triggerRemediation,
    isAhaRevealing,
    highlightedId,
    ahaCompanionLine,
    RemediationPopup
  } = useRemediationFlow({
    reduceMotion,
    soundEnabled,
    onFlowComplete: () => {
      console.log('Remediation flow finished smoothly!');
    }
  });

  const handleSelectPreset = (index) => {
    setSelectedConfigIndex(index);
    setActiveConfig(MOCK_CONFIGS[index]);
  };

  const handleFieldChange = (field, value) => {
    setActiveConfig((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleProblemChange = (field, value) => {
    setActiveConfig((prev) => ({
      ...prev,
      problem: {
        ...prev.problem,
        [field]: value
      }
    }));
  };

  const handleGameComplete = (payload) => {
    setLastLog(payload);
    setIsPopupOpen(false);
  };

  // Simulate Stalling: injects a config with an auto-finish timeout of 100ms
  const handleSimulateStall = () => {
    // Open game and let auto-finish take over or trigger directly
    setIsPopupOpen(true);
  };

  // Simulate Check-in Breakdown (triggers useRemediationFlow)
  const handleSimulateBreakdown = () => {
    triggerRemediation(
      {
        result: 'breakdown',
        remediation: activeConfig,
        highlightOptionId: 'option-correct-answer'
      },
      () => {
        console.log('Host question app resumes!');
      }
    );
  };

  return (
    <div
      className="min-h-screen p-6 sm:p-10"
      style={{
        backgroundColor: '#f1f5f9',
        fontFamily: "'Lexend', 'Atkinson Hyperlegible', sans-serif"
      }}
    >
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-300">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-3xl">🛠️</span>
              <h1 className="text-3xl font-black text-gray-900 m-0">
                Remediation Mini-Games Dev Lab
              </h1>
            </div>
            <p className="text-gray-600 font-medium text-base mt-1">
              ADHD-friendly popup mini-games (Order the Steps & Match Pairs) shown after 2 check-in missteps.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPopupOpen(true)}
              className="px-6 py-3 rounded-full bg-emerald-600 text-white font-extrabold text-base shadow-md hover:bg-emerald-700 transition-all"
            >
              ▶ Launch Direct Game
            </button>
            <button
              onClick={handleSimulateBreakdown}
              className="px-6 py-3 rounded-full bg-indigo-600 text-white font-extrabold text-base shadow-md hover:bg-indigo-700 transition-all"
            >
              ⚡ Simulate API Breakdown
            </button>
          </div>
        </div>

        {/* Mock Check-in Question Simulator Area (to showcase 3s "Aha" reveal) */}
        <div className="p-6 rounded-3xl bg-white border-2 border-indigo-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
              Host App Check-In Question Simulator
            </span>
            {isAhaRevealing && (
              <span className="text-sm font-extrabold text-amber-700 bg-amber-100 px-3 py-1 rounded-full animate-pulse">
                🌟 3-Second "Aha" Reveal Active!
              </span>
            )}
          </div>

          <h3 className="text-xl font-extrabold text-gray-800 mb-4">
            Question: What is {activeConfig.problem.a} {activeConfig.problem.op} {activeConfig.problem.b}?
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {['option-wrong-1', 'option-correct-answer', 'option-wrong-2', 'option-wrong-3'].map((optId, idx) => {
              const isHighlighted = highlightedId === optId;
              const val = optId === 'option-correct-answer'
                ? activeConfig.problem.op === '+'
                  ? activeConfig.problem.a + activeConfig.problem.b
                  : activeConfig.problem.a - activeConfig.problem.b
                : idx + 1;

              return (
                <div
                  key={optId}
                  className={`p-4 rounded-2xl text-center font-black text-2xl border-3 transition-all ${
                    isHighlighted
                      ? 'border-emerald-500 bg-emerald-50 ring-4 ring-emerald-300 scale-105 shadow-lg'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  {val}
                  {isHighlighted && (
                    <div className="text-xs font-bold text-emerald-700 mt-1">
                      ✨ Correct Answer Glow
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isAhaRevealing && (
            <div className="mt-4 p-4 rounded-2xl bg-amber-50 border-2 border-amber-200 text-amber-900 font-bold text-base flex items-center gap-3">
              <span className="text-2xl">🦉</span>
              <span>{ahaCompanionLine}</span>
            </div>
          )}
        </div>

        {/* Dev Control Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Preset Selector */}
          <div className="p-6 rounded-3xl bg-white border-2 border-gray-200 shadow-sm flex flex-col gap-4">
            <h2 className="text-lg font-black text-gray-800 m-0">1. Mock Presets (6 Configs)</h2>
            <div className="flex flex-col gap-2">
              {MOCK_CONFIGS.map((cfg, idx) => (
                <button
                  key={cfg.id}
                  onClick={() => handleSelectPreset(idx)}
                  className={`p-3 rounded-2xl text-left font-bold text-sm transition-all border-2 ${
                    selectedConfigIndex === idx
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm'
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {cfg.name}
                </button>
              ))}
            </div>
          </div>

          {/* Config Controls */}
          <div className="p-6 rounded-3xl bg-white border-2 border-gray-200 shadow-sm flex flex-col gap-4">
            <h2 className="text-lg font-black text-gray-800 m-0">2. Interactive Parameters</h2>

            {/* Game Type */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase text-gray-500">Game Type</label>
              <select
                value={activeConfig.gameType}
                onChange={(e) => handleFieldChange('gameType', e.target.value)}
                className="p-2.5 rounded-xl border-2 border-gray-200 font-bold text-sm bg-gray-50"
              >
                <option value="order_steps">Companion's Secret Steps (Order the Steps)</option>
                <option value="match_pairs">Match the Numbers (Match Pairs Face-Up)</option>
              </select>
            </div>

            {/* Theme */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase text-gray-500">Theme</label>
              <select
                value={activeConfig.theme}
                onChange={(e) => handleFieldChange('theme', e.target.value)}
                className="p-2.5 rounded-xl border-2 border-gray-200 font-bold text-sm bg-gray-50"
              >
                {Object.keys(THEMES).map((t) => (
                  <option key={t} value={t}>{THEMES[t].name}</option>
                ))}
              </select>
            </div>

            {/* Companion */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase text-gray-500">Companion</label>
              <select
                value={activeConfig.companion.key}
                onChange={(e) => handleFieldChange('companion', { key: e.target.value, name: COMPANIONS[e.target.value]?.name || 'Companion' })}
                className="p-2.5 rounded-xl border-2 border-gray-200 font-bold text-sm bg-gray-50"
              >
                {Object.keys(COMPANIONS).map((c) => (
                  <option key={c} value={c}>{COMPANIONS[c].name}</option>
                ))}
              </select>
            </div>

            {/* Math Problem (a, op, b) */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase text-gray-500">Problem (A [Op] B)</label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  min="1"
                  max="9"
                  value={activeConfig.problem.a}
                  onChange={(e) => handleProblemChange('a', Number(e.target.value))}
                  className="p-2 text-center rounded-xl border-2 border-gray-200 font-bold"
                />
                <select
                  value={activeConfig.problem.op}
                  onChange={(e) => handleProblemChange('op', e.target.value)}
                  className="p-2 text-center rounded-xl border-2 border-gray-200 font-black text-base bg-gray-50"
                >
                  <option value="+">+</option>
                  <option value="-">-</option>
                </select>
                <input
                  type="number"
                  min="1"
                  max="9"
                  value={activeConfig.problem.b}
                  onChange={(e) => handleProblemChange('b', Number(e.target.value))}
                  className="p-2 text-center rounded-xl border-2 border-gray-200 font-bold"
                />
              </div>
            </div>
          </div>

          {/* Accessibility & Simulation Toggles */}
          <div className="p-6 rounded-3xl bg-white border-2 border-gray-200 shadow-sm flex flex-col gap-4">
            <h2 className="text-lg font-black text-gray-800 m-0">3. Accessibility & Tests</h2>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="font-bold text-sm text-gray-700">Reduce Motion</span>
              <input
                type="checkbox"
                checked={reduceMotion}
                onChange={(e) => setReduceMotion(e.target.checked)}
                className="w-5 h-5 accent-emerald-600 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="font-bold text-sm text-gray-700">Sound / Voice Synthesis</span>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="w-5 h-5 accent-emerald-600 cursor-pointer"
              />
            </div>

            <button
              onClick={handleSimulateStall}
              className="mt-2 p-3 rounded-2xl border-2 border-amber-300 bg-amber-50 text-amber-900 font-extrabold text-sm hover:bg-amber-100 transition-all text-center"
            >
              ⏳ Simulate Stalling / Soft Cap
            </button>

            {/* Telemetry Logger Box */}
            <div className="mt-2 p-3 rounded-2xl bg-slate-900 text-slate-100 text-xs font-mono">
              <div className="font-bold text-slate-400 mb-1">Telemetry Payload (onComplete):</div>
              {lastLog ? (
                <pre className="overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(lastLog, null, 2)}
                </pre>
              ) : (
                <span className="text-slate-500 italic">Play a game to see payload logged</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Direct Popup Modal */}
      {isPopupOpen && (
        <RemediationGame
          config={activeConfig}
          onComplete={handleGameComplete}
          reduceMotion={reduceMotion}
          soundEnabled={soundEnabled}
        />
      )}

      {/* Hook Controlled Popup */}
      <RemediationPopup />
    </div>
  );
}
