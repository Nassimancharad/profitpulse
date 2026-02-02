export type ExpenseInput = {
  shopId: string | null;
  amount: number;
  frequency: string;
  startDate: Date;
  endDate: Date | null;
};

export type ExpenseAllocation = {
  shopId: string | null;
  allocatedAmount: number;
};

function atStartOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function atEndOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function daysBetweenInclusive(start: Date, end: Date) {
  const startDay = atStartOfDay(start);
  const endDay = atStartOfDay(end);
  const diff = endDay.getTime() - startDay.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

function clampRange(start: Date, end: Date, min: Date, max: Date) {
  const clampedStart = start > min ? start : min;
  const clampedEnd = end < max ? end : max;
  return clampedStart <= clampedEnd ? { start: clampedStart, end: clampedEnd } : null;
}

function splitRangeByMonth(start: Date, end: Date) {
  const segments: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    const segmentStart = new Date(cursor);
    const segmentEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    if (segmentEnd > end) {
      segmentEnd.setTime(end.getTime());
    }
    segments.push({ start: segmentStart, end: segmentEnd });

    cursor = new Date(segmentEnd);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return segments;
}

export function allocateMonthlyExpenses(
  expenses: ExpenseInput[],
  rangeStart: Date,
  rangeEnd: Date,
): ExpenseAllocation[] {
  const allocations = new Map<string, number>();
  const rangeStartDay = atStartOfDay(rangeStart);
  const rangeEndDay = atEndOfDay(rangeEnd);

  for (const expense of expenses) {
    if (expense.frequency !== 'monthly') continue;
    const expenseStart = atStartOfDay(expense.startDate);
    const expenseEnd = expense.endDate ? atEndOfDay(expense.endDate) : rangeEndDay;
    const overlap = clampRange(expenseStart, expenseEnd, rangeStartDay, rangeEndDay);
    if (!overlap) continue;

    let allocated = 0;
    const segments = splitRangeByMonth(overlap.start, overlap.end);
    for (const segment of segments) {
      const totalDaysInMonth = new Date(
        segment.start.getFullYear(),
        segment.start.getMonth() + 1,
        0,
      ).getDate();
      const overlapDays = daysBetweenInclusive(segment.start, segment.end);
      const dailyRate = expense.amount / totalDaysInMonth;
      allocated += dailyRate * overlapDays;
    }

    const key = expense.shopId ?? 'portfolio';
    allocations.set(key, (allocations.get(key) ?? 0) + allocated);
  }

  return Array.from(allocations.entries()).map(([shopId, allocatedAmount]) => ({
    shopId: shopId === 'portfolio' ? null : shopId,
    allocatedAmount,
  }));
}

export function getTotalExpensesForView(
  allocations: ExpenseAllocation[],
  netRevenueByShop: Map<string, number>,
  activeShopId: string | null,
): number {
  const portfolioExpense = allocations.find((alloc) => alloc.shopId === null)?.allocatedAmount ?? 0;
  const storeExpenses = allocations.filter((alloc) => alloc.shopId !== null);
  const totalStoreExpenses = storeExpenses.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);

  if (!activeShopId) {
    return totalStoreExpenses + portfolioExpense;
  }

  const activeStoreExpenses = storeExpenses
    .filter((alloc) => alloc.shopId === activeShopId)
    .reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
  const totalNetRevenue = Array.from(netRevenueByShop.values()).reduce((sum, val) => sum + val, 0);
  const portfolioShare = totalNetRevenue > 0
    ? (netRevenueByShop.get(activeShopId) ?? 0) / totalNetRevenue
    : 0;

  return activeStoreExpenses + portfolioExpense * portfolioShare;
}
