import { describe, it, expect } from "vitest";
import { annualToMonthlyRate, buildMonthLabels, runEngine } from "./calculator";
import type { Simulation, Asset } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAsset(overrides: Partial<Asset> & { id: string }): Asset {
  return {
    simulationId: "sim1",
    type: "stock",
    name: "Test",
    startDate: "2025-01-01",
    endDate: "2025-12-01",
    initialValue: 0,
    displayOrder: 0,
    functions: [],
    branches: [],
    ...overrides,
  };
}

function makeSim(assets: Asset[], overrides?: Partial<Simulation>): Simulation {
  return {
    id: "sim1",
    userId: "user1",
    name: "Test Simulation",
    startDate: "2025-01-01",
    endDate: "2025-12-01",
    assets,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Monthly rate conversion
// ---------------------------------------------------------------------------

describe("annualToMonthlyRate", () => {
  it("converts 5% annual to ~0.407% monthly", () => {
    const monthly = annualToMonthlyRate(0.05);
    // (1.05)^(1/12) - 1 ≈ 0.004074
    expect(monthly).toBeCloseTo(0.004074, 5);
  });

  it("returns 0 for 0% annual rate", () => {
    expect(annualToMonthlyRate(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Simple compound growth over 12 months
// ---------------------------------------------------------------------------

describe("compound growth", () => {
  it("grows 100000 at 5% annual over 12 months to ~105000", () => {
    const asset = makeAsset({
      id: "a1",
      type: "stock",
      initialValue: 100000,
      annualRate: 0.05,
      startDate: "2025-01-01",
      endDate: "2025-12-01",
    });
    const sim = makeSim([asset]);
    const result = runEngine(sim);
    const values = result.assets["a1"];

    // First month: initialValue
    expect(values[0]).toBeCloseTo(100000, 0);
    // After 12 months: 100000 * 1.05^(11/12) (11 growth steps from month 0 to month 11)
    // Actually: month 0 = initialValue, month 1 = v0*(1+r), ..., month 11 = v10*(1+r)
    // So 11 compounding steps → 100000 * (1 + monthlyRate)^11
    const monthlyRate = annualToMonthlyRate(0.05);
    const expected = 100000 * Math.pow(1 + monthlyRate, 11);
    expect(values[11]).toBeCloseTo(expected, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Dynamic asset with a mid-lifecycle deposit
// ---------------------------------------------------------------------------

describe("mid-lifecycle deposit", () => {
  it("applies deposit at correct month and continues compounding", () => {
    const asset = makeAsset({
      id: "a1",
      type: "liquid",
      initialValue: 100000,
      annualRate: 0.0,
      startDate: "2025-01-01",
      endDate: "2025-12-01",
      functions: [
        {
          id: "f1",
          assetId: "a1",
          type: "deposit_once",
          startDate: "2025-06-01",
          amount: 50000,
        },
      ],
    });
    const sim = makeSim([asset]);
    const result = runEngine(sim);
    const values = result.assets["a1"];

    // Month 0 (Jan): 100000 + 0 delta = 100000
    expect(values[0]).toBe(100000);
    // Month 4 (May): 100000 (no interest, no delta)
    expect(values[4]).toBe(100000);
    // Month 5 (Jun): prev * (1+0) + 50000 = 150000
    expect(values[5]).toBe(150000);
    // Month 6 (Jul): 150000
    expect(values[6]).toBe(150000);
  });
});

// ---------------------------------------------------------------------------
// 4. Dynamic asset with a mid-lifecycle withdrawal
// ---------------------------------------------------------------------------

describe("mid-lifecycle withdrawal", () => {
  it("applies withdrawal at correct month", () => {
    const asset = makeAsset({
      id: "a1",
      type: "liquid",
      initialValue: 200000,
      annualRate: 0.0,
      startDate: "2025-01-01",
      endDate: "2025-12-01",
      functions: [
        {
          id: "f1",
          assetId: "a1",
          type: "withdrawal_once",
          startDate: "2025-04-01",
          amount: 50000,
        },
      ],
    });
    const sim = makeSim([asset]);
    const result = runEngine(sim);
    const values = result.assets["a1"];

    expect(values[0]).toBe(200000);
    // Month 3 (Apr): 200000 - 50000 = 150000
    expect(values[3]).toBe(150000);
    expect(values[4]).toBe(150000);
  });
});

// ---------------------------------------------------------------------------
// 5. Property: fixed rate + agent fee before child receives value
// ---------------------------------------------------------------------------

describe("property with fixed rate and agent fee", () => {
  it("deducts agent fee from final value before passing to child", () => {
    const parent = makeAsset({
      id: "parent",
      type: "property",
      initialValue: 10000000,
      annualRate: 0.0, // flat, for easy math
      startDate: "2025-01-01",
      endDate: "2025-06-01",
      agentFee: 100000,
      branches: [
        {
          id: "b1",
          parentAssetId: "parent",
          childAssetId: "child",
          type: "percent",
          value: 1.0,
        },
      ],
    });
    const child = makeAsset({
      id: "child",
      type: "liquid",
      initialValue: 0,
      annualRate: 0.0,
      startDate: "2025-06-01",
      endDate: "2025-12-01",
    });
    const sim = makeSim([parent, child], {
      startDate: "2025-01-01",
      endDate: "2025-12-01",
    });
    const result = runEngine(sim);

    // Parent final value = 10,000,000 (0% rate), after fee = 9,900,000
    // Child starts June with 9,900,000
    const childValues = result.assets["child"];
    const juneIdx = result.months.indexOf("2025-06");
    expect(childValues[juneIdx]).toBeCloseTo(9900000, 0);
  });
});

// ---------------------------------------------------------------------------
// 6. Property with variable rates (including "default" fallback)
// ---------------------------------------------------------------------------

describe("property with variable rates", () => {
  it("uses year-specific rate and falls back to default", () => {
    // 2-year simulation: 2025 uses 10%, 2026 uses default 2%
    const asset = makeAsset({
      id: "p1",
      type: "property",
      initialValue: 1000000,
      variableRates: { "2025": 0.1, default: 0.02 },
      startDate: "2025-01-01",
      endDate: "2026-12-01",
    });
    const sim = makeSim([asset], {
      startDate: "2025-01-01",
      endDate: "2026-12-01",
    });
    const result = runEngine(sim);
    const values = result.assets["p1"];

    // After 12 months of 10% annual growth: 1,000,000 * 1.1^(11/12 steps)
    const monthly10 = annualToMonthlyRate(0.1);
    // Month 0 = 1000000, month 11 = 1000000 * (1+monthly10)^11
    const afterYear1 = 1000000 * Math.pow(1 + monthly10, 11);
    const jan2026Idx = result.months.indexOf("2026-01");
    // Jan 2026 is month index 12: applies the 2026 rate (default 2%)
    const monthly2 = annualToMonthlyRate(0.02);
    const expected2026Jan = afterYear1 * (1 + monthly2);
    expect(values[jan2026Idx]).toBeCloseTo(expected2026Jan, 0);
  });

  it("uses 2% when no default key is set for unlisted year", () => {
    const asset = makeAsset({
      id: "p1",
      type: "property",
      initialValue: 1000000,
      variableRates: { "2025": 0.05 }, // no default
      startDate: "2025-01-01",
      endDate: "2026-06-01",
    });
    const sim = makeSim([asset], {
      startDate: "2025-01-01",
      endDate: "2026-06-01",
    });
    const result = runEngine(sim);
    // 2026 months should use 2% (hardcoded fallback)
    const jan2026Idx = result.months.indexOf("2026-01");
    const dec2025Idx = result.months.indexOf("2025-12");
    const monthly2 = annualToMonthlyRate(0.02);
    const values = result.assets["p1"];
    expect(values[jan2026Idx]).toBeCloseTo(values[dec2025Idx] * (1 + monthly2), 0);
  });
});

// ---------------------------------------------------------------------------
// 7. Loan: constant negative value + establishment cost
// ---------------------------------------------------------------------------

describe("loan", () => {
  it("has constant negative value throughout lifecycle", () => {
    const asset = makeAsset({
      id: "loan1",
      type: "loan",
      initialValue: 500000,
      startDate: "2025-01-01",
      endDate: "2025-12-01",
      establishmentCost: 10000,
    });
    const sim = makeSim([asset]);
    const result = runEngine(sim);
    const values = result.assets["loan1"];

    // All active months should be -500000
    for (let i = 0; i < 12; i++) {
      expect(values[i]).toBe(-500000);
    }
  });

  it("deducts establishment cost from net_worth at start month", () => {
    const loan = makeAsset({
      id: "loan1",
      type: "loan",
      initialValue: 500000,
      startDate: "2025-01-01",
      endDate: "2025-12-01",
      establishmentCost: 10000,
    });
    const sim = makeSim([loan]);
    const result = runEngine(sim);

    // Jan: total_assets=0, total_debt=-500000, establishment deduction=10000
    // net_worth = 0 + (-500000) - 10000 = -510000
    expect(result.aggregations.net_worth[0]).toBeCloseTo(-510000, 0);
    // Feb onwards: deduction still cumulative = 10000
    expect(result.aggregations.net_worth[1]).toBeCloseTo(-510000, 0);
  });
});

// ---------------------------------------------------------------------------
// 8. Parent → child value flow (percent and amount branch types)
// ---------------------------------------------------------------------------

describe("parent-child value flow", () => {
  it("percent branch: child receives correct fraction of parent final value", () => {
    const parent = makeAsset({
      id: "parent",
      type: "stock",
      initialValue: 1000000,
      annualRate: 0.0,
      startDate: "2025-01-01",
      endDate: "2025-06-01",
      branches: [
        {
          id: "b1",
          parentAssetId: "parent",
          childAssetId: "child",
          type: "percent",
          value: 0.5,
        },
      ],
    });
    const child = makeAsset({
      id: "child",
      type: "liquid",
      initialValue: 0,
      annualRate: 0.0,
      startDate: "2025-06-01",
      endDate: "2025-12-01",
    });
    const sim = makeSim([parent, child], {
      startDate: "2025-01-01",
      endDate: "2025-12-01",
    });
    const result = runEngine(sim);
    const juneIdx = result.months.indexOf("2025-06");
    expect(result.assets["child"][juneIdx]).toBeCloseTo(500000, 0);
  });

  it("amount branch: child receives fixed amount capped at parent value", () => {
    const parent = makeAsset({
      id: "parent",
      type: "stock",
      initialValue: 1000000,
      annualRate: 0.0,
      startDate: "2025-01-01",
      endDate: "2025-06-01",
      branches: [
        {
          id: "b1",
          parentAssetId: "parent",
          childAssetId: "child",
          type: "amount",
          value: 300000,
        },
      ],
    });
    const child = makeAsset({
      id: "child",
      type: "liquid",
      initialValue: 0,
      annualRate: 0.0,
      startDate: "2025-06-01",
      endDate: "2025-12-01",
    });
    const sim = makeSim([parent, child], {
      startDate: "2025-01-01",
      endDate: "2025-12-01",
    });
    const result = runEngine(sim);
    const juneIdx = result.months.indexOf("2025-06");
    expect(result.assets["child"][juneIdx]).toBeCloseTo(300000, 0);
  });
});

// ---------------------------------------------------------------------------
// 9. Surplus calculation when branches don't cover 100%
// ---------------------------------------------------------------------------

describe("surplus calculation", () => {
  it("returns undistributed surplus when branches sum < 100%", () => {
    const parent = makeAsset({
      id: "parent",
      type: "stock",
      initialValue: 1000000,
      annualRate: 0.0,
      startDate: "2025-01-01",
      endDate: "2025-06-01",
      branches: [
        {
          id: "b1",
          parentAssetId: "parent",
          childAssetId: "child",
          type: "percent",
          value: 0.6, // 60%
        },
      ],
    });
    const child = makeAsset({
      id: "child",
      type: "liquid",
      initialValue: 0,
      annualRate: 0.0,
      startDate: "2025-06-01",
      endDate: "2025-12-01",
    });
    const sim = makeSim([parent, child], {
      startDate: "2025-01-01",
      endDate: "2025-12-01",
    });
    const result = runEngine(sim);
    // Surplus = 1,000,000 * (1 - 0.6) = 400,000
    expect(result.surpluses["parent"]).toBeCloseTo(400000, 0);
  });

  it("returns full value as surplus when no branches exist", () => {
    const parent = makeAsset({
      id: "parent",
      type: "stock",
      initialValue: 500000,
      annualRate: 0.0,
      startDate: "2025-01-01",
      endDate: "2025-06-01",
    });
    const sim = makeSim([parent], {
      startDate: "2025-01-01",
      endDate: "2025-12-01",
    });
    const result = runEngine(sim);
    expect(result.surpluses["parent"]).toBeCloseTo(500000, 0);
  });
});

// ---------------------------------------------------------------------------
// 10. Aggregation: net_worth = total_assets + total_debt
// ---------------------------------------------------------------------------

describe("aggregation", () => {
  it("net_worth = total_assets + total_debt", () => {
    const stock = makeAsset({
      id: "s1",
      type: "stock",
      initialValue: 300000,
      annualRate: 0.0,
      startDate: "2025-01-01",
      endDate: "2025-12-01",
    });
    const loan = makeAsset({
      id: "l1",
      type: "loan",
      initialValue: 100000,
      startDate: "2025-01-01",
      endDate: "2025-12-01",
      establishmentCost: 0,
    });
    const sim = makeSim([stock, loan]);
    const result = runEngine(sim);

    for (let i = 0; i < result.months.length; i++) {
      expect(result.aggregations.net_worth[i]).toBeCloseTo(
        result.aggregations.total_assets[i] + result.aggregations.total_debt[i],
        1
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Pension excluded from total_assets when toggle is off
// ---------------------------------------------------------------------------

describe("pension toggle", () => {
  it("excludes pension from total_assets when includePension=false", () => {
    const stock = makeAsset({
      id: "s1",
      type: "stock",
      initialValue: 200000,
      annualRate: 0.0,
      startDate: "2025-01-01",
      endDate: "2025-12-01",
    });
    const pension = makeAsset({
      id: "p1",
      type: "pension",
      initialValue: 500000,
      annualRate: 0.0,
      startDate: "2025-01-01",
      endDate: "2025-12-01",
    });
    const sim = makeSim([stock, pension]);

    const withPension = runEngine(sim, { includePension: true });
    const withoutPension = runEngine(sim, { includePension: false });

    // With pension: total_assets = 200000 + 500000 = 700000
    expect(withPension.aggregations.total_assets[0]).toBeCloseTo(700000, 0);
    // Without pension: total_assets = 200000
    expect(withoutPension.aggregations.total_assets[0]).toBeCloseTo(200000, 0);
  });

  it("still shows pension in assets array even when toggle is off", () => {
    const pension = makeAsset({
      id: "p1",
      type: "pension",
      initialValue: 500000,
      annualRate: 0.0,
      startDate: "2025-01-01",
      endDate: "2025-12-01",
    });
    const sim = makeSim([pension]);
    const result = runEngine(sim, { includePension: false });

    // The pension asset values should still be computed
    expect(result.assets["p1"][0]).toBe(500000);
  });
});
