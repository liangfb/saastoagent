import { create } from 'zustand';
import type { OpenapiSource } from '@/types/api';
import { openapiSourcesApi } from '@/api/openapi-sources';
import { getErrorMessage, itemsOf } from '@/lib/utils';

interface OpenapiState {
  items: OpenapiSource[];
  loading: boolean;
  error: string | null;
  selectedSourceId: string | null;
  fetchItems: () => Promise<void>;
  createItem: (data: Partial<OpenapiSource>) => Promise<void>;
  updateItem: (id: string, data: Partial<OpenapiSource>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  setSelected: (id: string | null) => void;
}

export const useOpenapiStore = create<OpenapiState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  selectedSourceId: null,
  fetchItems: async () => {
    set({ loading: true, error: null });
    try {
      const data = await openapiSourcesApi.list();
      set({ items: itemsOf<OpenapiSource>(data), loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false });
    }
  },
  createItem: async (data) => {
    await openapiSourcesApi.create(data);
    await get().fetchItems();
  },
  updateItem: async (id, data) => {
    await openapiSourcesApi.update(id, data);
    await get().fetchItems();
  },
  deleteItem: async (id) => {
    await openapiSourcesApi.delete(id);
    await get().fetchItems();
  },
  setSelected: (id) => set({ selectedSourceId: id }),
}));
