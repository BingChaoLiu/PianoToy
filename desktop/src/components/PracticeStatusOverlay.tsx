// PracticeStatusOverlay: Shows a premium, modern overlay when waiting to start or paused.
import { Play, Pause } from "lucide-react";
import { useT } from "@/lib/i18n";

interface Props {
  state: "waiting-to-start" | "paused";
  onClick: () => void;
}

export function PracticeStatusOverlay({ state, onClick }: Props) {
  const t = useT();

  const isWaiting = state === "waiting-to-start";
  const title = isWaiting ? t("countdown.ready") : t("countdown.paused");
  const subtitle = isWaiting ? t("countdown.press_space_start") : t("countdown.press_space_resume");

  return (
    <div 
      onClick={onClick}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-0/70 backdrop-blur-[2px] transition-all duration-300 cursor-pointer group"
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-bg-3 bg-bg-1/80 p-8 shadow-2xl transition-all duration-300 hover:border-accent/30 hover:shadow-accent/5 max-w-xs text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-bg-3 bg-bg-2 text-fg transition-all duration-300 group-hover:scale-110 group-hover:border-accent/40 group-hover:bg-accent/10 group-hover:text-accent shadow-inner">
          {/* Pulsing outer ring */}
          <div className="absolute inset-0 rounded-full animate-ping bg-accent/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {isWaiting ? (
            <Play className="h-6 w-6 fill-current translate-x-[2px]" />
          ) : (
            <Pause className="h-6 w-6 fill-current" />
          )}
        </div>
        
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold tracking-wider text-fg uppercase">
            {title}
          </h2>
          <p className="text-xs text-muted font-medium px-2 py-0.5 rounded bg-bg-2 border border-bg-3 whitespace-nowrap">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
