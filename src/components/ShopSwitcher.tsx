"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { formatShopLabel } from "@/lib/shopLabel";
import { DropdownSelect } from "./DropdownSelect";

type ShopOption = {
  id: string;
  shopDomain: string;
};

type ShopSwitcherProps = {
  shops: ShopOption[];
  selectedShopDomain?: string | null;
  includeAll?: boolean;
};

export function ShopSwitcher({ shops, selectedShopDomain, includeAll = true }: ShopSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (shops.length <= 1) {
    return null;
  }

  const options = includeAll
    ? [{ id: "all", shopDomain: "All stores" }, ...shops]
    : shops;
  const currentValue = selectedShopDomain ?? "all";
  const onChange = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (value === "all") {
      params.delete("shop");
    } else {
      params.set("shop", value);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <DropdownSelect
      value={currentValue}
      options={options.map((shop) => ({
        value: shop.shopDomain === "All stores" ? "all" : shop.shopDomain,
        label: shop.shopDomain === "All stores" ? shop.shopDomain : formatShopLabel(shop.shopDomain),
      }))}
      onChange={onChange}
      buttonLabel="Select store"
    />
  );
}
