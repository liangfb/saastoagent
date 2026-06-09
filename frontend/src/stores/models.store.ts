import { create } from 'zustand';
import type { LlmConfig, LlmModelAssignment } from '@/types/api';
import { llmConfigsApi, llmAssignmentsApi } from '@/api/llm-configs';
import { getErrorMessage, itemsOf } from '@/lib/utils';

interface AssignmentInput {
  usageType: string;
  llmConfigId: string;
  fallbackLlmConfigId?: string | null;
}

interface ModelsState {
  configs: LlmConfig[];
  assignments: LlmModelAssignment[];
  loading: boolean;
  error: string | null;
  fetchConfigs: () => Promise<void>;
  fetchAssignments: () => Promise<void>;
  createConfig: (data: Partial<LlmConfig> & { credentials?: Record<string, unknown> }) => Promise<void>;
  updateConfig: (
    id: string,
    data: Partial<LlmConfig> & { credentials?: Record<string, unknown> },
  ) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  updateAssignments: (assignments: AssignmentInput[]) => Promise<void>;
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  configs: [],
  assignments: [],
  loading: false,
  error: null,
  fetchConfigs: async () => {
    set({ loading: true, error: null });
    try {
      const data = await llmConfigsApi.list();
      set({ configs: itemsOf<LlmConfig>(data), loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false });
    }
  },
  fetchAssignments: async () => {
    try {
      const data = await llmAssignmentsApi.get();
      set({ assignments: (data as unknown as LlmModelAssignment[]) ?? [] });
    } catch (err) {
      set({ error: getErrorMessage(err) });
    }
  },
  createConfig: async (data) => {
    await llmConfigsApi.create(data);
    await get().fetchConfigs();
  },
  updateConfig: async (id, data) => {
    await llmConfigsApi.update(id, data);
    await get().fetchConfigs();
  },
  deleteConfig: async (id) => {
    await llmConfigsApi.delete(id);
    await get().fetchConfigs();
  },
  updateAssignments: async (assignments) => {
    await llmAssignmentsApi.update({ assignments });
    await get().fetchAssignments();
  },
}));
