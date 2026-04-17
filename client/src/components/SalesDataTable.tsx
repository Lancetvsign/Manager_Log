import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pencil, Loader2, DollarSign, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import { useToast } from "@/hooks/use-toast";

interface DailySalesEntry {
  id: number;
  date: string;
  dayOfWeek: string;
  foodSales: number;
  barSales: number;
  gamingSales: number;
  totalSales: number;
}

interface SalesDataTableProps {
  data: DailySalesEntry[];
}

export function SalesDataTable({ data }: SalesDataTableProps) {
  const { clubId, apiBaseUrl } = useManagerLog();
  const { toast } = useToast();
  const [editingEntry, setEditingEntry] = useState<DailySalesEntry | null>(null);
  const [editFood, setEditFood] = useState("");
  const [editBar, setEditBar] = useState("");
  const [editGaming, setEditGaming] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (data: { date: string; foodSales: string; barSales: string; gamingSales: string }) => {
      const url = buildApiUrl("/api/manager-logs/historical", clubId, apiBaseUrl);
      const dateObj = new Date(data.date + "T12:00:00");
      const dayOfWeek = dateObj.toLocaleDateString("en-US", { weekday: "long" });
      const response = await apiRequest("POST", url, {
        logDate: data.date,
        dayOfWeek,
        foodSales: data.foodSales,
        barSales: data.barSales,
        gamingSales: data.gamingSales,
        clubId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs"] });
      toast({ title: "Sales updated", description: "The sales data has been saved." });
      setEditingEntry(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update sales data.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const url = buildApiUrl(`/api/manager-logs/${id}`, clubId, apiBaseUrl);
      await apiRequest("DELETE", url);
    },
    onSuccess: (_data, deletedId) => {
      queryClient.setQueryData(["/api/manager-logs", clubId], (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.filter((log: { id: number }) => log.id !== deletedId);
      });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs"] });
      toast({ title: "Record deleted", description: "The sales record has been removed." });
      setEditingEntry(null);
      setConfirmDelete(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete the sales record.", variant: "destructive" });
      setConfirmDelete(false);
    },
  });

  const openEditDialog = (entry: DailySalesEntry) => {
    setEditingEntry(entry);
    setEditFood(entry.foodSales.toFixed(2));
    setEditBar(entry.barSales.toFixed(2));
    setEditGaming(entry.gamingSales.toFixed(2));
    setConfirmDelete(false);
  };

  const handleSave = () => {
    if (!editingEntry) return;
    updateMutation.mutate({
      date: editingEntry.date,
      foodSales: editFood || "0",
      barSales: editBar || "0",
      gamingSales: editGaming || "0",
    });
  };

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (editingEntry) {
      deleteMutation.mutate(editingEntry.id);
    }
  };

  const editTotal = (parseFloat(editFood || "0") || 0) + (parseFloat(editBar || "0") || 0) + (parseFloat(editGaming || "0") || 0);

  const sortedData = [...data].sort((a, b) => b.date.localeCompare(a.date));

  if (sortedData.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground text-center">
            No sales data available for the selected date range.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3">Date</th>
                  <th className="text-left font-medium p-3">Day</th>
                  <th className="text-right font-medium p-3">Food</th>
                  <th className="text-right font-medium p-3">Bar</th>
                  <th className="text-right font-medium p-3">Gaming</th>
                  <th className="text-right font-medium p-3">Total</th>
                  <th className="text-center font-medium p-3 w-20">Edit</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-b-0">
                    <td className="p-3 font-medium">{entry.date}</td>
                    <td className="p-3 text-muted-foreground">{entry.dayOfWeek}</td>
                    <td className="p-3 text-right">${entry.foodSales.toFixed(2)}</td>
                    <td className="p-3 text-right">${entry.barSales.toFixed(2)}</td>
                    <td className="p-3 text-right">${entry.gamingSales.toFixed(2)}</td>
                    <td className="p-3 text-right font-semibold">${entry.totalSales.toFixed(2)}</td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`button-edit-sales-${entry.date}`}
                        onClick={() => openEditDialog(entry)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingEntry} onOpenChange={(open) => { if (!open) { setEditingEntry(null); setConfirmDelete(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Edit Sales Data
            </DialogTitle>
            <DialogDescription>
              {editingEntry && `${editingEntry.date} — ${editingEntry.dayOfWeek}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-food">Food Sales</Label>
              <Input
                id="edit-food"
                type="number"
                step="0.01"
                min="0"
                value={editFood}
                onChange={(e) => setEditFood(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bar">Bar Sales</Label>
              <Input
                id="edit-bar"
                type="number"
                step="0.01"
                min="0"
                value={editBar}
                onChange={(e) => setEditBar(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-gaming">Gaming Sales</Label>
              <Input
                id="edit-gaming"
                type="number"
                step="0.01"
                min="0"
                value={editGaming}
                onChange={(e) => setEditGaming(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Total:</span>
                <Badge variant="secondary" className="text-base">
                  ${editTotal.toFixed(2)}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setEditingEntry(null); setConfirmDelete(false); }}
                  disabled={updateMutation.isPending || deleteMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant={confirmDelete ? "destructive" : "ghost"}
                  data-testid="button-delete-sales"
                  onClick={handleDeleteClick}
                  disabled={updateMutation.isPending || deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : confirmDelete ? (
                    "Confirm Delete?"
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </>
                  )}
                </Button>
                <Button onClick={handleSave} disabled={updateMutation.isPending || deleteMutation.isPending}>
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
