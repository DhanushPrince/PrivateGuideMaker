/**
 * ai-titles.js — On-device step titles via Chrome's built-in Prompt API
 * (Gemini Nano, extensions since Chrome 138). Nothing leaves the device.
 * If the model isn't already available, the recorder's deterministic
 * template text ('Click "Save"', 'Type in "Email"') is kept as-is.
 */
const LANG = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const SYSTEM = 'You write one short imperative step title for a how-to guide (max 10 words), '
  + 'e.g. Click "Save" to store your changes. Reply with the title only. Never invent data.';

export async function aiTitles(steps, save) {
  if (typeof LanguageModel === 'undefined') return false;
  const todo = steps.filter(s => !s.aiTitle && (s.type === 'click' || s.type === 'keystroke') && s.description);
  // 'downloadable' needs a user gesture to start the download — skip, keep templates.
  if (!todo.length || (await LanguageModel.availability(LANG)) !== 'available') return false;
  const session = await LanguageModel.create({ ...LANG, initialPrompts: [{ role: 'system', content: SYSTEM }] });
  try {
    for (const s of todo) {
      // Inputs were PII-masked at record time (recorder.js maskText).
      const ctx = JSON.stringify({ action: s.description, element: s.targetTag, page: s.pageTitle });
      const out = stripQuotes((await session.prompt(ctx)).trim().split('\n')[0]).slice(0, 120);
      if (out) Object.assign(s, await save(s.id, { description: out, templateDescription: s.description, aiTitle: true }));
    }
  } finally { session.destroy(); }
  return true;
}

// Strip leading/trailing quote and asterisk characters (linear, no regex backtracking).
function stripQuotes(str) {
  const q = new Set(['"', "'", '*']);
  let a = 0, b = str.length;
  while (a < b && q.has(str[a])) a++;
  while (b > a && q.has(str[b - 1])) b--;
  return str.slice(a, b);
}
