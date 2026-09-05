import { create } from 'zustand';

const USER_KEY = 'auth_user';
const TOKEN_KEY = 'auth_token';

function getInitialUsername() {
  const username = localStorage.getItem(USER_KEY);
  const token = localStorage.getItem(TOKEN_KEY);

  if (username && token) return username;

  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  return null;
}

interface AuthState {
  username: string | null;
  login: (username: string, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  username: getInitialUsername(),
  login: (username, token) => {
    localStorage.setItem(USER_KEY, username);
    localStorage.setItem(TOKEN_KEY, token);
    set({ username });
  },
  logout: () => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    set({ username: null });
  },
}));
