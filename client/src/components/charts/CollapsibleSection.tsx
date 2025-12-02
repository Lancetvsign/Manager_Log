/**
 * COLLAPSIBLE SECTION COMPONENT
 * ==============================
 * A section wrapper with expand/collapse functionality.
 * State is persisted to localStorage for session continuity.
 * 
 * Features:
 * - Smooth expand/collapse animation
 * - Persisted state via localStorage
 * - Custom icon and title
 * 
 * @example
 * <CollapsibleSection
 *   id="salesTrend"
 *   title="Sales Trend"
 *   icon={<TrendingUp className="h-5 w-5" />}
 *   defaultExpanded={true}
 * >
 *   <SalesTrendChart ... />
 * </CollapsibleSection>
 */

import { useState, useEffect, type ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";

const STORAGE_KEY = "insights-sections-state";

interface CollapsibleSectionProps {
  id: string;
  title: string;
  icon?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export default function CollapsibleSection({
  id,
  title,
  icon,
  defaultExpanded = true,
  children,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const state = JSON.parse(stored);
        return state[id] ?? defaultExpanded;
      }
    } catch {
    }
    return defaultExpanded;
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const state = stored ? JSON.parse(stored) : {};
      state[id] = isExpanded;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
    }
  }, [id, isExpanded]);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="flex items-center justify-between mb-4">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="p-0 h-auto hover:bg-transparent gap-2"
            data-testid={`button-collapse-${id}`}
          >
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="flex items-center gap-2">
              {icon}
              <h3 className="text-lg font-semibold">{title}</h3>
            </div>
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-6">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
