-- ═══════════════════════════════════════════════════════════
-- Schwartz Call Time Tracker — Supabase Schema
-- ═══════════════════════════════════════════════════════════
-- Run this in your Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- Daily call time entries
CREATE TABLE IF NOT EXISTS daily_entries (
  date DATE PRIMARY KEY,
  hours DECIMAL(5,2) DEFAULT 0,
  calls INTEGER DEFAULT 0,
  pickups INTEGER DEFAULT 0,
  pledges INTEGER DEFAULT 0,
  follow_ups INTEGER DEFAULT 0,
  follow_ups_complete INTEGER DEFAULT 0,
  raised DECIMAL(10,2) DEFAULT 0,
  pledged DECIMAL(10,2) DEFAULT 0,
  list_called TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Callback tracking
CREATE TABLE IF NOT EXISTS callbacks (
  id SERIAL PRIMARY KEY,
  recorded DATE NOT NULL,
  name TEXT NOT NULL,
  callback_on TEXT DEFAULT '',
  call_made BOOLEAN DEFAULT FALSE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_entries_updated_at
  BEFORE UPDATE ON daily_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER callbacks_updated_at
  BEFORE UPDATE ON callbacks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security (recommended)
ALTER TABLE daily_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE callbacks ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access (for the app to read/write without auth)
-- ⚠️ For production, you'd want to add proper auth
CREATE POLICY "Allow all access to daily_entries" ON daily_entries
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to callbacks" ON callbacks
  FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_entries(date);
CREATE INDEX IF NOT EXISTS idx_callbacks_recorded ON callbacks(recorded);
CREATE INDEX IF NOT EXISTS idx_callbacks_call_made ON callbacks(call_made);
