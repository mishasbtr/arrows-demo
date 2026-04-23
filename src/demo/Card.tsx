import type { CSSProperties, ReactNode } from "react";
import { useArrowAnchor } from "../arrow-canvas";

export type CardProps = {
  id: string;
  children: ReactNode;
  style?: CSSProperties;
};

export const Card = ({ id, children, style }: CardProps) => {
  const ref = useArrowAnchor<HTMLDivElement>(id);
  return (
    <div
      ref={ref}
      className="tw:absolute tw:px-5 tw:py-3.5 tw:bg-white tw:border tw:border-slate-300 tw:rounded-[10px] tw:shadow-sm tw:font-sans tw:text-sm tw:font-medium tw:text-slate-900 tw:whitespace-nowrap"
      style={style}
    >
      {children}
    </div>
  );
};
