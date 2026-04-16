import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StandardDropZoneProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  title: string;
  subtitle: string;
  accept?: string;
  accentColor?: string; // e.g., "red", "emerald", "blue"
  className?: string;
}

export function StandardDropZone({
  file,
  onFileSelect,
  title,
  subtitle,
  accept = ".xlsx,.xls,.csv",
  accentColor = "red",
  className,
}: StandardDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputId = React.useId();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFileSelect(f);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f);
  };

  return (
    <div
      className={cn(
        "flex-1 group relative flex flex-col items-center justify-center gap-4",
        "rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-all duration-200",
        file
          ? "border-emerald-500 bg-emerald-500/10"
          : dragOver
          ? `border-${accentColor}-500 bg-${accentColor}-500/10 scale-[1.01]`
          : "border-border/60 bg-secondary/40 hover:border-primary/50 hover:bg-secondary/60",
        "shadow-sm hover:shadow-md",
        className
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => document.getElementById(inputId)?.click()}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileInput}
      />

      <AnimatePresence mode="wait">
        {file ? (
          <motion.div
            key="success"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground text-sm truncate max-w-[200px]">
                {file.name}
              </p>
              <p className="text-xs text-emerald-600/80 font-medium">Listo para procesar</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-3"
          >
            <div className={cn(
              "h-16 w-16 rounded-full flex items-center justify-center transition-colors duration-200",
              dragOver ? `bg-${accentColor}-500/20` : "bg-primary/10 group-hover:bg-primary/20"
            )}>
              <Upload className={cn(
                "h-8 w-8 transition-colors duration-200",
                dragOver ? `text-${accentColor}-500` : "text-primary/60 group-hover:text-primary"
              )} />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground text-sm">{title}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glossy overlay effect */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
    </div>
  );
}
