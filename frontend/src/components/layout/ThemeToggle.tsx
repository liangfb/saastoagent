import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useThemeStore, type ThemeMode } from '@/stores';

const OPTIONS: { value: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'auto', label: 'Auto', icon: Monitor },
];

export function ThemeToggle() {
  const { mode, resolved, setMode } = useThemeStore();
  // Show the icon that reflects what's currently rendered, except for Auto
  // where we show Monitor so the user knows it's tracking the system.
  const TriggerIcon = mode === 'auto' ? Monitor : resolved === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Toggle theme">
            <TriggerIcon className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-36">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => setMode(opt.value)}
              className="flex items-center gap-2"
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{opt.label}</span>
              {active && <Check className="h-3 w-3 opacity-70" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
