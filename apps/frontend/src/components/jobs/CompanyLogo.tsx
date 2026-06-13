import { useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "../../lib/cn";

interface CompanyLogoProps {
  src: string;
  name: string;
  size?: "sm" | "lg";
}

/** Logo công ty; thiếu ảnh hoặc lỗi tải → icon toà nhà thay thế. */
export function CompanyLogo({ src, name, size = "sm" }: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <Building2
        className={cn(size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5", "shrink-0")}
      />
    );
  }
  return (
    <img
      src={src}
      alt={name ? `Logo ${name}` : "Logo công ty"}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(
        size === "lg" ? "h-6 w-6" : "h-5 w-5",
        "shrink-0 rounded-sm border border-border/50 bg-white object-contain",
      )}
    />
  );
}
