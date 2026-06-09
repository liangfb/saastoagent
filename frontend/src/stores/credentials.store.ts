import { create } from 'zustand';
import type { Credential } from '@/types/api';
import { credentialsApi } from '@/api/credentials';
import { getErrorMessage, itemsOf } from '@/lib/utils';

interface CredentialsState {
  items: Credential[];
  loading: boolean;
  error: string | null;
  fetchItems: () => Promise<void>;
  createItem: (data: Partial<Credential>) => Promise<void>;
  updateItem: (id: string, data: Partial<Credential>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

export const useCredentialsStore = create<CredentialsState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  fetchItems: async () => {
    set({ loading: true, error: null });
    try {
      const data = await credentialsApi.list();
      set({ items: itemsOf<Credential>(data), loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false });
    }
  },
  createItem: async (data) => {
    await credentialsApi.create(data);
    await get().fetchItems();
  },
  updateItem: async (id, data) => {
    await credentialsApi.update(id, data);
    await get().fetchItems();
  },
  deleteItem: async (id) => {
    await credentialsApi.delete(id);
    await get().fetchItems();
  },
}));
