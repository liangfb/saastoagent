import { Link } from 'react-router-dom';
import {
  Bot,
  Cpu,
  FileJson,
  MessageSquare,
  ScrollText,
  Server,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/shared';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/stores';

interface Tile {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

const tiles: Tile[] = [
  {
    to: '/identity',
    icon: Shield,
    title: 'Identity',
    description: 'Manage API keys and OAuth credentials used by OpenAPI sources.',
  },
  {
    to: '/openapi',
    icon: FileJson,
    title: 'API Resources',
    description: 'Import Swagger specs and generate MCP Servers from them.',
  },
  {
    to: '/mcp-servers',
    icon: Server,
    title: 'MCP Servers',
    description: 'Browse generated MCP Servers and their tool definitions.',
  },
  {
    to: '/agents',
    icon: Bot,
    title: 'Agents',
    description: 'Configure Router and Specialist Agents and their MCP bindings.',
  },
  {
    to: '/models',
    icon: Cpu,
    title: 'Models',
    description: 'Manage LLM providers and assign models to usage types.',
  },
  {
    to: '/playground',
    icon: MessageSquare,
    title: 'Playground',
    description: 'Chat with Agents and inspect execution traces.',
  },
  {
    to: '/logs',
    icon: ScrollText,
    title: 'Logs',
    description: 'Inspect pipeline logs, traces, and agent activity.',
  },
];

export function HomePage() {
  const username = useAuthStore((s) => s.username);

  return (
    <div className="space-y-6">
      <PageHeader
        title={username ? `Welcome, ${username}` : 'Welcome'}
        description="Pick a module to get started."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.to} to={tile.to} className="block">
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardContent className="flex gap-4">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-primary/10 text-primary">
                  <tile.icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="font-medium">{tile.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {tile.description}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
