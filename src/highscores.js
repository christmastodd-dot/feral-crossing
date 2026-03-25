const LS_KEY = 'feralCrossing_v1_scores';

export function getScores() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// Returns true if score qualifies for top-5
export function isHighScore(score) {
  if (score <= 0) return false;
  const scores = getScores();
  return scores.length < 5 || score > scores[scores.length - 1].score;
}

// Inserts score, sorts, trims to 5, persists. Returns updated list.
export function saveScore(score, name) {
  const scores = getScores();
  scores.push({
    score,
    name: String(name).slice(0, 12) || 'CAT',
  });
  scores.sort((a, b) => b.score - a.score);
  if (scores.length > 5) scores.length = 5;
  try { localStorage.setItem(LS_KEY, JSON.stringify(scores)); } catch { /* quota */ }
  return scores;
}
