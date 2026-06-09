import { NavLink } from 'react-router-dom';
import { Shield, FileJson, Bot, Cpu, ScrollText, Server, MessageSquare } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

const navItems = [
  { to: '/', icon: MessageSquare, label: 'Chat', end: true },
  { to: '/identity', icon: Shield, label: 'Identity' },
  { to: '/openapi', icon: FileJson, label: 'API Resources' },
  { to: '/mcp-servers', icon: Server, label: 'MCP Servers' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/models', icon: Cpu, label: 'Models' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
];

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-sidebar-primary" />
          <span className="text-sm font-semibold">SaaS to Agent Mesh</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    render={<NavLink to={item.to} end={item.end ?? false} />}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
