import { createClient } from '@supabase/supabase-js';

// ─── Supabase Client ───
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project'))
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// ─── Daily Entries ───
export async function fetchDailyEntries() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('daily_entries')
    .select('*')
    .order('date', { ascending: true });
  if (error) { console.error('Supabase fetch daily:', error); return []; }
  return data.map(row => ({
    date: row.date,
    hours: row.hours || 0,
    calls: row.calls || 0,
    pickups: row.pickups || 0,
    pledges: row.pledges || 0,
    followUps: row.follow_ups || 0,
    followUpsComplete: row.follow_ups_complete || 0,
    raised: row.raised || 0,
    pledged: row.pledged || 0,
    list: row.list_called || '',
    source: 'supabase',
  }));
}

export async function upsertDailyEntry(entry) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('daily_entries')
    .upsert({
      date: entry.date,
      hours: entry.hours,
      calls: entry.calls,
      pickups: entry.pickups,
      pledges: entry.pledges,
      follow_ups: entry.followUps,
      follow_ups_complete: entry.followUpsComplete,
      raised: entry.raised,
      pledged: entry.pledged,
      list_called: entry.list,
    }, { onConflict: 'date' })
    .select();
  if (error) console.error('Supabase upsert daily:', error);
  return data;
}

export async function deleteDailyEntry(date) {
  if (!supabase) return;
  const { error } = await supabase.from('daily_entries').delete().eq('date', date);
  if (error) console.error('Supabase delete daily:', error);
}

// ─── Callbacks ───
export async function fetchCallbacks() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('callbacks')
    .select('*')
    .order('recorded', { ascending: true });
  if (error) { console.error('Supabase fetch callbacks:', error); return []; }
  return data.map(row => ({
    id: row.id,
    recorded: row.recorded,
    name: row.name,
    callbackOn: row.callback_on,
    callMade: row.call_made,
    notes: row.notes || '',
    source: 'supabase',
  }));
}

export async function insertCallback(cb) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('callbacks')
    .insert({
      recorded: cb.recorded,
      name: cb.name,
      callback_on: cb.callbackOn,
      call_made: cb.callMade,
      notes: cb.notes,
    })
    .select();
  if (error) console.error('Supabase insert callback:', error);
  return data?.[0];
}

export async function updateCallback(id, updates) {
  if (!supabase) return;
  const mapped = {};
  if ('callMade' in updates) mapped.call_made = updates.callMade;
  if ('notes' in updates) mapped.notes = updates.notes;
  if ('callbackOn' in updates) mapped.callback_on = updates.callbackOn;
  const { error } = await supabase.from('callbacks').update(mapped).eq('id', id);
  if (error) console.error('Supabase update callback:', error);
}

export async function deleteCallbackDb(id) {
  if (!supabase) return;
  const { error } = await supabase.from('callbacks').delete().eq('id', id);
  if (error) console.error('Supabase delete callback:', error);
}
