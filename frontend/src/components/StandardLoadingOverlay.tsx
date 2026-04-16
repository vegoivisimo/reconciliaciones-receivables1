import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StandardLoadingOverlayProps {
  isVisible: boolean;
  title: string;
  subtitle: string;
  statusText?: string;
  className?: string;
}

export function StandardLoadingOverlay({
  isVisible,
  title,
  subtitle,
  statusText = "Iniciando decodificación...",
  className,
}: StandardLoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className={cn(
      "fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-300",
      className
    )}>
      <div className="bg-card/40 border border-primary/20 rounded-3xl shadow-2xl p-10 flex flex-col items-center gap-6 max-w-sm text-center backdrop-blur-xl relative overflow-hidden group">
        {/* Animated background glows */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/10 rounded-full blur-[80px] group-hover:bg-primary/20 transition-colors duration-1000" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-[80px] duration-1000" />
        
        <div className="relative">
          {/* Dual spinning loaders */}
          <div className="h-24 w-24 rounded-full border-4 border-primary/10 border-t-primary animate-spin shadow-[0_0_20px_rgba(255,0,0,0.1)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16 w-16 rounded-full border-4 border-blue-500/10 border-b-blue-500 animate-[spin_1.5s_linear_infinite_reverse]" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-primary/40 animate-pulse" />
          </div>
        </div>

        <div className="space-y-2 relative">
          <h3 className="text-xl font-bold text-foreground tracking-tight">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed px-4">
            {subtitle}
          </p>
        </div>

        {statusText && (
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.2em] mt-4 font-semibold">
            {statusText}
          </p>
        )}
      </div>
    </div>
  );
}
