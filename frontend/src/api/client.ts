import axios from 'axios';
import type { ApiResponse } from '@/types/api';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>;
    if (body.code !== undefined && body.code !== 0) {
      return Promise.reject(new Error(body.message || 'Unknown error'));
    }
    return body.data as never;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
    const msg = error.response?.data?.message || error.message;
    return Promise.reject(new Error(msg));
  },
);

export default apiClient;
