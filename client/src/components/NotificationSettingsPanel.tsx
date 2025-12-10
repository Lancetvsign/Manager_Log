import { useEffect, useState } from "react";

interface NotificationList {
  id: number;
  clubId: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  recipientCount: number;
}

interface NotificationRecipient {
  id: number;
  listId: number;
  name?: string | null;
  email: string;
}

interface NotificationSettingsPanelProps {
  clubId: string;
  onChanged?: () => void;
}

export function NotificationSettingsPanel({
  clubId,
  onChanged,
}: NotificationSettingsPanelProps) {
  const [lists, setLists] = useState<NotificationList[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [newListName, setNewListName] = useState("");
  const [newRecipientName, setNewRecipientName] = useState("");
  const [newRecipientEmail, setNewRecipientEmail] = useState("");

  async function loadLists() {
    const res = await fetch(`/api/notifications/lists?clubId=${clubId}`);
    const data = await res.json();
    setLists(data);
    if (!selectedListId && data.length) {
      setSelectedListId(data[0].id);
    }
  }

  async function loadRecipients(listId: number) {
    const res = await fetch(`/api/notifications/lists/${listId}/recipients`);
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
    await fetch("/api/notifications/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId, name: newListName }),
    });
    setNewListName("");
    await loadLists();
    onChanged?.();
  }

  async function handleAddRecipient() {
    if (!selectedListId || !newRecipientEmail.trim()) return;
    await fetch(`/api/notifications/lists/${selectedListId}/recipients`, {
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
    onChanged?.();
  }

  async function handleDeleteList(id: number) {
    await fetch(`/api/notifications/lists/${id}`, { method: "DELETE" });
    if (selectedListId === id) setSelectedListId(null);
    await loadLists();
    onChanged?.();
  }

  async function handleDeleteRecipient(id: number) {
    await fetch(`/api/notifications/recipients/${id}`, { method: "DELETE" });
    if (selectedListId) {
      await loadRecipients(selectedListId);
    }
    onChanged?.();
  }

  return (
    <div className="grid grid-cols-[1.2fr_2fr] gap-6">
      <section>
        <h2 className="text-base font-semibold mb-2">Notification Lists</h2>
        <div className="border rounded-lg overflow-hidden">
          {lists.map((list) => (
            <div
              key={list.id}
              className={
                "w-full px-3 py-2 text-left flex items-center justify-between border-b last:border-b-0 cursor-pointer hover:bg-muted/50" +
                (list.id === selectedListId ? " bg-primary/10" : "")
              }
              onClick={() => setSelectedListId(list.id)}
              data-testid={`list-item-${list.id}`}
            >
              <div>
                <div className="font-medium">
                  {list.name}{" "}
                  {list.isDefault && (
                    <span className="text-xs text-primary ml-1">
                      Default
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {list.description || "No description"} ·{" "}
                  {list.recipientCount} recipient
                  {list.recipientCount === 1 ? "" : "s"}
                </div>
              </div>
              <button
                type="button"
                className="text-destructive text-xs hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteList(list.id);
                }}
                data-testid={`button-delete-list-${list.id}`}
              >
                Delete
              </button>
            </div>
          ))}
          {lists.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No lists yet. Create one below.
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 border rounded px-2 py-1 text-sm bg-background"
            placeholder="New list name (e.g. Core Team)"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            data-testid="input-new-list-name"
          />
          <button
            type="button"
            className="px-3 py-1 text-sm rounded bg-primary text-primary-foreground"
            onClick={handleAddList}
            data-testid="button-add-list"
          >
            Add
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">
          Recipients{selectedListId
            ? ` for "${lists.find((l) => l.id === selectedListId)?.name ?? ""}"`
            : ""}
        </h2>

        {selectedListId ? (
          <>
            <table className="w-full text-sm border rounded overflow-hidden">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.id} className="border-t" data-testid={`recipient-row-${r.id}`}>
                    <td className="px-3 py-1">{r.name || "—"}</td>
                    <td className="px-3 py-1">{r.email}</td>
                    <td className="px-3 py-1 text-right">
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline"
                        onClick={() => handleDeleteRecipient(r.id)}
                        data-testid={`button-delete-recipient-${r.id}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {recipients.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-2 text-sm text-muted-foreground"
                    >
                      No recipients yet. Add one below.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 border rounded px-2 py-1 text-sm bg-background"
                placeholder="Name (optional)"
                value={newRecipientName}
                onChange={(e) => setNewRecipientName(e.target.value)}
                data-testid="input-recipient-name"
              />
              <input
                className="flex-1 border rounded px-2 py-1 text-sm bg-background"
                placeholder="Email"
                value={newRecipientEmail}
                onChange={(e) => setNewRecipientEmail(e.target.value)}
                data-testid="input-recipient-email"
              />
              <button
                type="button"
                className="px-3 py-1 text-sm rounded bg-foreground text-background"
                onClick={handleAddRecipient}
                data-testid="button-add-recipient"
              >
                Add
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a list on the left to manage its recipients.
          </p>
        )}
      </section>
    </div>
  );
}
