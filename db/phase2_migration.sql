-- Phase 2 migration: simulation engine tables

CREATE TABLE IF NOT EXISTS simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('stock', 'liquid', 'pension', 'property', 'loan')),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  initial_value NUMERIC NOT NULL DEFAULT 0,
  parent_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 0,

  -- Annual return rate (pro anno, stored as decimal e.g. 0.05 for 5%)
  -- Used by: stock, liquid, pension, property (fixed rate mode)
  annual_rate NUMERIC,

  -- Property: variable rates per year, stored as JSONB
  -- Format: { "2026": 0.10, "2027": 0.04, "default": 0.02 }
  variable_rates JSONB,

  -- Property: agent fee deducted at end_date before passing value to child
  agent_fee NUMERIC DEFAULT 100000,

  -- Loan: one-time establishment cost at start_date
  establishment_cost NUMERIC DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit_once', 'withdrawal_once', 'deposit_recurring', 'withdrawal_recurring')),

  -- For once: the date of the transaction
  -- For recurring: the start date
  start_date DATE NOT NULL,

  -- For recurring only
  end_date DATE,
  interval_months INTEGER,

  amount NUMERIC NOT NULL,

  -- Optional: if set, money moves from/to another asset instead of entering/leaving the simulation
  counterpart_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Links a parent asset to a child asset and defines how much value is passed
CREATE TABLE IF NOT EXISTS asset_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  child_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('amount', 'percent')),
  value NUMERIC NOT NULL,  -- absolute amount OR percent as decimal (e.g. 0.42 for 42%)
  UNIQUE (parent_asset_id, child_asset_id)
);
