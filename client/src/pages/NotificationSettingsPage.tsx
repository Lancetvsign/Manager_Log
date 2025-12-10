import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, Mail, Users } from "lucide-react";
import { useManagerLog } from "@/contexts/ManagerLogContext";

const ROLE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "core_team", label: "Core Team" },
  { value: "maintenance", label: "Maintenance" },
  { value: "ownership", label: "Ownership" },
  { value: "kitchen_staff", label: "Kitchen Staff" },
  { value: "custom", label: "Custom" },
];

interface NotificationList {
  id: number;
  clubId: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  roleKey?: string | null;
  recipientCount: number;
}

interface NotificationRecipient {
  id: number;
  listId: number;
  name?: string | null;
  email: string;
}

export default function NotificationSettingsPage() {
  const { clubId, apiBaseUrl } = useManagerLog();
  const [lists, setLists] = useState<NotificationList[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [newListName, setNewListName] = useState("");
  const [newRecipientName, setNewRecipientName] = useState("");
  const [newRecipientEmail, setNewRecipientEmail] = useState("");

  async function loadLists() {
    const res = await fetch(`${apiBaseUrl}/api/notifications/lists?clubId=${clubId}`);
    const data = await res.json();
    setLists(data);
    if (!selectedListId && data.length) {
      setSelectedListId(data[0].id);
    }
  }

  async function loadRecipients(listId: number) {
    const res = await fetch(`${apiBaseUrl}/api/notifications/lists/${listId}/recipients`);
    const data = await res.json();
    setRecipients(data);
  }

  useEffect(() => {
    loadLists();
  }, [clubId]);

  useEffect(() => {
    if (selectedListId) loadRecipients(selectedListId);
    else setRecipients([]);
  }, [selectedListId]);

  async function handleAddList() {
    if (!newListName.trim()) return;
    await fetch(`${apiBaseUrl}/api/notifications/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId, name: newListName }),
    });
    setNewListName("");
    await loadLists();
  }

  async function handleDeleteList(id: number) {
    await fetch(`${apiBaseUrl}/api/notifications/lists/${id}`, {
      method: "DELETE",
    });
    if (selectedListId === id) {
      setSelectedListId(null);
      setRecipients([]);
    }
    await loadLists();
  }

  async function handleRoleChange(listId: number, roleKey: string | null) {
    await fetch(`${apiBaseUrl}/api/notifications/lists/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId, roleKey }),
    });
    await loadLists();
  }

  async function handleAddRecipient() {
    if (!selectedListId || !newRecipientEmail.trim()) return;
    await fetch(`${apiBaseUrl}/api/notifications/lists/${selectedListId}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newRecipientName || undefined,
        email: newRecipientEmail,
      }),
    });
    setNewRecipientName("");
    setNewRecipientEmail("");
    await loadRecipients(selectedListId);
    await loadLists();
  }

  async function handleDeleteRecipient(id: number) {
    await fetch(`${apiBaseUrl}/api/notifications/recipients/${id}`, {
      method: "DELETE",
    });
    if (selectedListId) {
      await loadRecipients(selectedListId);
      await loadLists();
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Mail className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Notification Settings</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Notification Lists
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-lg divide-y">
              {lists.map((list) => (
                <div
                  key={list.id}
                  className={`px-3 py-3 cursor-pointer transition-colors ${
                    list.id === selectedListId ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedListId(list.id)}
                  data-testid={`list-item-${list.id}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {list.name}
                        {list.isDefault && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {list.description || "No description"} · {list.recipientCount} recipients
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteList(list.id);
                      }}
                      data-testid={`button-delete-list-${list.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs text-muted-foreground">Role:</span>
                    <Select
                      value={list.roleKey || "none"}
                      onValueChange={(val) => handleRoleChange(list.id, val === "none" ? null : val)}
                    >
                      <SelectTrigger
                        className="h-7 w-32 text-xs"
                        data-testid={`select-role-${list.id}`}
                      >
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
              {lists.length === 0 && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  No lists yet. Create your first list below.
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="New list name (e.g. Core Team)"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddList()}
                data-testid="input-new-list-name"
              />
              <Button onClick={handleAddList} data-testid="button-add-list">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {selectedListId
                ? `Recipients for "${lists.find((l) => l.id === selectedListId)?.name}"`
                : "Recipients"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedListId ? (
              <div className="space-y-4">
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {recipients.map((r) => (
                        <tr key={r.id} data-testid={`recipient-row-${r.id}`}>
                          <td className="px-3 py-2">{r.name || "—"}</td>
                          <td className="px-3 py-2">{r.email}</td>
                          <td className="px-3 py-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteRecipient(r.id)}
                              data-testid={`button-delete-recipient-${r.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {recipients.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-muted-foreground text-center">
                            No recipients yet. Add one below.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Name (optional)"
                    value={newRecipientName}
                    onChange={(e) => setNewRecipientName(e.target.value)}
                    className="flex-1"
                    data-testid="input-recipient-name"
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={newRecipientEmail}
                    onChange={(e) => setNewRecipientEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddRecipient()}
                    className="flex-1"
                    data-testid="input-recipient-email"
                  />
                  <Button onClick={handleAddRecipient} data-testid="button-add-recipient">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Select a list on the left to manage its recipients.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
