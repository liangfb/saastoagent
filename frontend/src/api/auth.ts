import apiClient from './client';

export interface LoginResponse {
  token: string;
  username: string;
}

export const authApi = {
  login: (data: { username: string; password: string }) =>
    apiClient.post('/auth/login', data) as unknown as Promise<LoginResponse>,
};
