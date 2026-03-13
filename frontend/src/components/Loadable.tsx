import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Rings } from "react-loader-spinner";

export type LoadableProps = {
  loading?: boolean;
  loader?: "skeleton" | "rings";
  size?: number;
  value: React.ReactNode;
  count?: number;
  className?: string;
  highlightColor?: string;
  baseColor?: string;
}

export default function Loadable({ loading, loader = "skeleton", size = 60, value, count, className, highlightColor, baseColor }: LoadableProps) {
  const isLoading = loading ?? value === undefined;

  if (!isLoading) return <>{value}</>;

  return loader === "rings" ? (
    <Rings
      visible={true}
      height={size}
      width={size}
      color="#3B3BF9"
      ariaLabel="rings-loading"
      wrapperStyle={{}}
      wrapperClass=""
    />
  ) : (
    <Skeleton
      count={count}
      highlightColor={highlightColor || "#e5e5e5"}
      baseColor={baseColor || "#d4d4d4"}
      className={`${className} min-w-[3rem]`}
    />
  );
}
