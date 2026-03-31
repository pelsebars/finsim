// Input data types for the calculation engine.
// These mirror the DB schema but are plain objects — no DB calls here.

export type AssetType = "stock" | "liquid" | "pension" | "property" | "loan";

export type FunctionType =
  | "deposit_once"
  | "withdrawal_once"
  | "deposit_recurring"
  | "withdrawal_recurring";

export type BranchType = "amount" | "percent";

export interface AssetFunction {
  id: string;
  assetId: string;
  type: FunctionType;
  /** ISO date string (YYYY-MM-DD) */
  startDate: string;
  /** ISO date string — recurring only */
  endDate?: string;
  intervalMonths?: number;
  amount: number;
  /** If set, money moves to/from this asset instead of leaving the simulation */
  counterpartAssetId?: string;
}

export interface AssetBranch {
  id: string;
  parentAssetId: string;
  childAssetId: string;
  type: BranchType;
  value: number;
}

export interface Asset {
  id: string;
  simulationId: string;
  type: AssetType;
  name: string;
  /** ISO date string (YYYY-MM-DD) */
  startDate: string;
  /** ISO date string (YYYY-MM-DD) */
  endDate: string;
  initialValue: number;
  parentId?: string;
  displayOrder: number;

  /** Annual rate as decimal (e.g. 0.05 = 5%). Used by stock/liquid/pension/property fixed mode. */
  annualRate?: number;

  /**
   * Property variable rates per calendar year.
   * Format: { "2026": 0.10, "2027": 0.04, "default": 0.02 }
   */
  variableRates?: Record<string, number>;

  /** Property agent fee subtracted from final value before passing to child. Default 100000. */
  agentFee?: number;

  /** Loan: one-time cost deducted from simulation total at start_date. */
  establishmentCost?: number;

  functions: AssetFunction[];
  /** Branches where this asset is the parent */
  branches: AssetBranch[];
}

export interface Simulation {
  id: string;
  userId: string;
  name: string;
  /** ISO date string (YYYY-MM-DD) */
  startDate: string;
  /** ISO date string (YYYY-MM-DD) */
  endDate: string;
  assets: Asset[];
}

// --- Engine output types ---

export interface EngineResult {
  /** Array of month labels in "YYYY-MM" format */
  months: string[];
  /** Per-asset monthly values indexed by assetId */
  assets: Record<string, number[]>;
  aggregations: {
    total_assets: number[];
    total_debt: number[];
    net_worth: number[];
  };
  /** Undistributed value per parent asset at its end_date */
  surpluses: Record<string, number>;
}

export interface EngineOptions {
  /** When false, pension assets are excluded from total_assets aggregation */
  includePension?: boolean;
}
