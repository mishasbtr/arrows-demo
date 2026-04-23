import type { ReactNode } from "react";

export type BadgeProps = {
  children: ReactNode;
  color?: string;
};

export const Badge = ({ children, color = "#0ea5e9" }: BadgeProps) => (
  <div
    className="tw:w-7 tw:h-7 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-[13px] tw:font-bold tw:text-white tw:font-sans tw:ring-4 tw:ring-slate-100 tw:shadow-md"
    style={{ backgroundColor: color }}
  >
    {children}
  </div>
);
