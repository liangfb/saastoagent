import { create } from 'zustand';
import type { Agent } from '@/types/api';
import { agentsApi } from '@/api/agents';
import { getErrorMessage, itemsOf } from '@/lib/utils';

interface AgentsState {
  items: Agent[];
  loading: boolean;
  error: string | null;
  fetchItems: () => Promise<void>;
  createItem: (data: Partial<Agent>) => Promise<Agent>;
  updateItem: (id: string, data: Partial<Agent>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  fetchItems: async () => {
    set({ loading: true, error: null });
    try {
      const data = await agentsApi.list();
      set({ items: itemsOf<Agent>(data), loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false });
    }
  },
  createItem: async (data) => {
    const created = (await agentsApi.create(data)) as unknown as Agent;
    await get().fetchItems();
    return created;
  },
  updateItem: async (id, data) => {
    await agentsApi.update(id, data);
    await get().fetchItems();
  },
  deleteItem: async (id) => {
    await agentsApi.delete(id);
    await get().fetchItems();
  },
}));
