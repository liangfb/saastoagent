import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores';
import { ThemeToggle } from './ThemeToggle';

export function AppHeader() {
  const { username, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background/60 px-4 backdrop-blur-sm">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <h1 className="brand-gradient-text text-base font-bold tracking-tight">
        SaaS to Agent Mesh
      </h1>
      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        {username && (
          <span className="text-sm text-muted-foreground">{username}</span>
        )}
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </header>
  );
}
