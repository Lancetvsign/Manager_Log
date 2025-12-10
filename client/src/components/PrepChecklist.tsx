import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, RefreshCw, ClipboardList, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PrepChecklistItem } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";

interface PrepChecklistProps {
  targetDate: string;
  clubId: string;
  readOnly?: boolean;
}

export function PrepChecklist({ targetDate, clubId, readOnly = false }: PrepChecklistProps) {
  const { toast } = useToast();
  const [newItemText, setNewItemText] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const tomorrowDate = format(addDays(new Date(targetDate), 1), "yyyy-MM-dd");

  const { data: items = [], isLoading } = useQuery<PrepChecklistItem[]>({
    queryKey: ["/api/prep-checklist", targetDate, clubId],
    queryFn: async () => {
      const response = await fetch(`/api/prep-checklist?targetDate=${targetDate}&clubId=${clubId}`);
      if (!response.ok) throw new Error("Failed to fetch prep checklist");
      return response.json();
    },
    enabled: !!targetDate,
  });

  const createMutation = useMutation({
    mutationFn: async (description: string) => {
      return apiRequest("POST", `/api/prep-checklist?clubId=${clubId}`, {
        description,
        targetDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prep-checklist", targetDate, clubId] });
      setNewItemText("");
      setIsAdding(false);
      toast({ title: "Added", description: "Prep item added to checklist." });
    },
    onError: (error) => {
      console.error("Error creating prep item:", error);
      toast({ title: "Error", description: "Could not add prep item.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<PrepChecklistItem> }) => {
      return apiRequest("PATCH", `/api/prep-checklist/${id}?clubId=${clubId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prep-checklist", targetDate, clubId] });
    },
    onError: (error) => {
      console.error("Error updating prep item:", error);
      toast({ title: "Error", description: "Could not update prep item.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/prep-checklist/${id}?clubId=${clubId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prep-checklist", targetDate, clubId] });
      toast({ title: "Deleted", description: "Prep item removed." });
    },
    onError: (error) => {
      console.error("Error deleting prep item:", error);
      toast({ title: "Error", description: "Could not delete prep item.", variant: "destructive" });
    },
  });

  const rolloverMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/prep-checklist/rollover?clubId=${clubId}`, {
        fromDate: targetDate,
        toDate: tomorrowDate,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/prep-checklist"] });
      toast({
        title: "Rolled Over",
        description: `${data.rolledOverCount || 0} pending items moved to tomorrow.`,
      });
    },
    onError: (error) => {
      console.error("Error rolling over prep items:", error);
      toast({ title: "Error", description: "Could not rollover items.", variant: "destructive" });
    },
  });

  const handleAddItem = () => {
    if (!newItemText.trim()) return;
    createMutation.mutate(newItemText.trim());
  };

  const handleToggleComplete = (item: PrepChecklistItem) => {
    const newStatus = item.status === "completed" ? "pending" : "completed";
    updateMutation.mutate({ id: item.id, updates: { status: newStatus } });
  };

  const pendingItems = items.filter((i) => i.status === "pending");
  const completedItems = items.filter((i) => i.status === "completed");

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Tomorrow's Prep Checklist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Tomorrow's Prep Checklist
          </CardTitle>
          {!readOnly && pendingItems.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => rolloverMutation.mutate()}
              disabled={rolloverMutation.isPending}
              data-testid="button-rollover"
            >
              <ChevronRight className="h-3 w-3 mr-1" />
              Roll to Next Day
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!readOnly && (
          <div>
            {isAdding ? (
              <form onSubmit={(e) => { e.preventDefault(); handleAddItem(); }} className="flex gap-2">
                <Input
                  placeholder="What needs to be prepped?"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  className="flex-1"
                  autoFocus
                  data-testid="input-prep-item"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={createMutation.isPending || !newItemText.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  data-testid="button-save-prep-item"
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsAdding(false);
                    setNewItemText("");
                  }}
                  data-testid="button-cancel-prep-item"
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsAdding(true)}
                className="w-full border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                data-testid="button-add-prep-item"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Prep Item
              </Button>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            No prep items for this date.
          </p>
        ) : (
          <div className="space-y-2">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                data-testid={`prep-item-${item.id}`}
              >
                <Checkbox
                  checked={false}
                  onCheckedChange={() => handleToggleComplete(item)}
                  disabled={readOnly || updateMutation.isPending}
                  data-testid={`checkbox-prep-${item.id}`}
                />
                <span className="flex-1 text-sm">{item.description}</span>
                {item.rolledOverCount && item.rolledOverCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    {item.rolledOverCount}x
                  </Badge>
                )}
                {!readOnly && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                    className="h-6 w-6"
                    data-testid={`button-delete-prep-${item.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
            {completedItems.length > 0 && (
              <div className="pt-2 border-t space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Completed</p>
                {completedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 p-2 rounded-md opacity-60"
                    data-testid={`prep-item-${item.id}`}
                  >
                    <Checkbox
                      checked={true}
                      onCheckedChange={() => handleToggleComplete(item)}
                      disabled={readOnly || updateMutation.isPending}
                      data-testid={`checkbox-prep-${item.id}`}
                    />
                    <span className="flex-1 text-sm line-through">{item.description}</span>
                    {!readOnly && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(item.id)}
                        disabled={deleteMutation.isPending}
                        className="h-6 w-6"
                        data-testid={`button-delete-prep-${item.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
