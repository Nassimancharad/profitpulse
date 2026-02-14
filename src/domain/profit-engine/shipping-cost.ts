export type ShippingCostRuleInput = {
  id?: string;
  countryCode: string | null;
  minOrderValue: number | null;
  maxOrderValue: number | null;
  costAmount: number;
};

export type ShippingOrderInput = {
  id: string;
  orderValue: number;
  shippingRevenue: number;
  refundedShippingAmount?: number | null;
  shippingCost: number | null;
  shippingCountryCode: string | null;
};

export type ShippingTotals = {
  shippingRevenue: number;
  shippingCost: number;
  shippingMargin: number;
  warnings: string[];
};

type ShippingCostResolution = {
  cost: number;
  matchedRuleId: string | null;
};

function normalizeCountry(code: string | null) {
  return code ? code.trim().toUpperCase() : null;
}

function ruleHasRange(rule: ShippingCostRuleInput) {
  return rule.minOrderValue != null || rule.maxOrderValue != null;
}

function isWithinRange(value: number, rule: ShippingCostRuleInput) {
  if (rule.minOrderValue != null && value < rule.minOrderValue) return false;
  if (rule.maxOrderValue != null && value > rule.maxOrderValue) return false;
  return true;
}

function sortRules(rules: ShippingCostRuleInput[]) {
  return [...rules].sort((a, b) => {
    const minA = a.minOrderValue ?? Number.NEGATIVE_INFINITY;
    const minB = b.minOrderValue ?? Number.NEGATIVE_INFINITY;
    if (minA !== minB) return minB - minA;
    const maxA = a.maxOrderValue ?? Number.POSITIVE_INFINITY;
    const maxB = b.maxOrderValue ?? Number.POSITIVE_INFINITY;
    if (maxA !== maxB) return maxA - maxB;
    const costDiff = a.costAmount - b.costAmount;
    if (costDiff !== 0) return costDiff;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

export function resolveShippingCost(
  rules: ShippingCostRuleInput[],
  orderValue: number,
  countryCode: string | null,
): ShippingCostResolution | null {
  const normalizedCountry = normalizeCountry(countryCode);

  const priorities: Array<{ requireCountry: boolean; requireRange: boolean }> = [
    { requireCountry: true, requireRange: true },
    { requireCountry: true, requireRange: false },
    { requireCountry: false, requireRange: true },
    { requireCountry: false, requireRange: false },
  ];

  for (const priority of priorities) {
    const matching = rules.filter((rule) => {
      const ruleCountry = normalizeCountry(rule.countryCode);
      const countryMatches = priority.requireCountry
        ? ruleCountry === normalizedCountry && ruleCountry !== null
        : ruleCountry === null;
      if (!countryMatches) return false;

      const hasRange = ruleHasRange(rule);
      if (priority.requireRange !== hasRange) return false;
      if (hasRange && !isWithinRange(orderValue, rule)) return false;
      return true;
    });

    if (matching.length > 0) {
      const [best] = sortRules(matching);
      return { cost: best.costAmount, matchedRuleId: best.id ?? null };
    }
  }

  return null;
}

export function calculateShippingTotals(
  orders: ShippingOrderInput[],
  rules: ShippingCostRuleInput[],
): ShippingTotals {
  let shippingRevenue = 0;
  let shippingCost = 0;
  const warnings: string[] = [];

  for (const order of orders) {
    const netShippingRevenue = Math.max(
      0,
      order.shippingRevenue - (order.refundedShippingAmount ?? 0),
    );
    shippingRevenue += netShippingRevenue;

    if (order.shippingCost != null) {
      shippingCost += order.shippingCost;
      continue;
    }

    const resolved = resolveShippingCost(rules, order.orderValue, order.shippingCountryCode);
    if (!resolved) {
      warnings.push(`No shipping cost rule matched for order ${order.id}.`);
      continue;
    }

    shippingCost += resolved.cost;
  }

  return {
    shippingRevenue,
    shippingCost,
    shippingMargin: shippingRevenue - shippingCost,
    warnings,
  };
}
