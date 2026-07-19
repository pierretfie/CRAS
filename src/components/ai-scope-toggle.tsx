import { User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AIScopeToggleProps {
  value: "mine" | "all";
  onChange: (value: "mine" | "all") => void;
  disabled?: boolean;
}

/**
 * Toggle for AI assistant to analyze "your data" vs "all data"
 * Shows in the AI drawer input area - available to all users
 */
export function AIScopeToggle({ value, onChange, disabled }: AIScopeToggleProps) {
  const isMine = value === "mine";
  const Icon = isMine ? User : Users;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onChange(value === "mine" ? "all" : "mine")}
            disabled={disabled}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
              isMine
                ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                : "border-amber-500/60 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs">{isMine ? "Your Data" : "All Data"}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium mb-1">
            {isMine ? "Analyzing your data" : "Analyzing all data"}
          </p>
          <p className="text-xs text-foreground/80">
            {isMine
              ? "AI will only see clients you created, interactions you logged, and follow-ups you scheduled"
              : "AI has access to organization-wide data including all users' clients and activities"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
