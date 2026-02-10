import { fetchDailyEntries, fetchCallbacks, supabase } from './supabase.js';
import { fetchSheetsDaily, fetchSheetsCallbacks, sheetsEnabled } from './sheets.js';
import { SEED_DAILY, SEED_CALLBACKS } from './seed-data.js';

const DATA_MODE = import.meta.env.VITE_DATA_MODE || 'both';

/**
 * Merge daily entries from two sources, preferring Supabase for duplicates (same date).
 * This lets Dan keep entering in Google Sheets while the team can also add/edit via the app.
 */
function mergeDailyEntries(sheetsData, supabaseData) {
  const byDate = new Map();
  
  // Sheets first (base layer)
  for (const entry of sheetsData) {
    byDate.set(entry.date, entry);
  }
  
  // Supabase overwrites (app edits take priority)
  for (const entry of supabaseData) {
    byDate.set(entry.date, entry);
  }
  
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Merge callbacks - Supabase entries are additive on top of Sheets.
 * Sheets callbacks are identified by `sheets-{index}` IDs.
 */
function mergeCallbacks(sheetsData, supabaseData) {
  // Sheets callbacks first, then Supabase additions
  return [...sheetsData, ...supabaseData];
}

// ─── Public API ───

export async function loadAllDaily() {
  try {
    if (DATA_MODE === 'sheets') {
      const sheets = sheetsEnabled ? await fetchSheetsDaily() : [];
      return sheets.length > 0 ? sheets : SEED_DAILY;
    }
    
    if (DATA_MODE === 'supabase') {
      const sb = supabase ? await fetchDailyEntries() : [];
      return sb.length > 0 ? sb : SEED_DAILY;
    }
    
    // "both" mode
    const [sheets, sb] = await Promise.all([
      sheetsEnabled ? fetchSheetsDaily() : Promise.resolve([]),
      supabase ? fetchDailyEntries() : Promise.resolve([]),
    ]);
    
    const merged = mergeDailyEntries(sheets, sb);
    return merged.length > 0 ? merged : SEED_DAILY;
  } catch (err) {
    console.error('loadAllDaily failed:', err);
    return SEED_DAILY;
  }
}

export async function loadAllCallbacks() {
  try {
    if (DATA_MODE === 'sheets') {
      const sheets = sheetsEnabled ? await fetchSheetsCallbacks() : [];
      return sheets.length > 0 ? sheets : SEED_CALLBACKS;
    }
    
    if (DATA_MODE === 'supabase') {
      const sb = supabase ? await fetchCallbacks() : [];
      return sb.length > 0 ? sb : SEED_CALLBACKS;
    }
    
    // "both" mode
    const [sheets, sb] = await Promise.all([
      sheetsEnabled ? fetchSheetsCallbacks() : Promise.resolve([]),
      supabase ? fetchCallbacks() : Promise.resolve([]),
    ]);
    
    const merged = mergeCallbacks(sheets, sb);
    return merged.length > 0 ? merged : SEED_CALLBACKS;
  } catch (err) {
    console.error('loadAllCallbacks failed:', err);
    return SEED_CALLBACKS;
  }
}

export function getDataMode() {
  return {
    mode: DATA_MODE,
    sheetsConnected: sheetsEnabled,
    supabaseConnected: !!supabase,
  };
}
