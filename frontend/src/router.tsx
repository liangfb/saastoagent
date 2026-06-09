import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute, RootLayout } from '@/components/layout';
import { LoginPage } from '@/pages/login';
import { IdentityPage } from '@/pages/identity';
import { OpenapiPage, OpenapiDetailPage, OpenapiEditPage } from '@/pages/openapi';
import { McpServersPage } from '@/pages/mcp-servers';
import { AgentsPage } from '@/pages/agents';
import { ModelsPage } from '@/pages/models';
import { PlaygroundPage } from '@/pages/playground';
import { LogsPage } from '@/pages/logs';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <RootLayout />,
        children: [
          // Playground replaces the old Home dashboard as the landing page.
          { index: true, element: <PlaygroundPage /> },
          // Keep /playground working for any bookmarks / external links.
          { path: 'playground', element: <Navigate to="/" replace /> },
          { path: 'identity', element: <IdentityPage /> },
          { path: 'openapi', element: <OpenapiPage /> },
          { path: 'openapi/:id', element: <OpenapiDetailPage /> },
          { path: 'openapi/:id/edit', element: <OpenapiEditPage /> },
          { path: 'mcp-servers', element: <McpServersPage /> },
          { path: 'agents', element: <AgentsPage /> },
          { path: 'models', element: <ModelsPage /> },
          { path: 'logs', element: <LogsPage /> },
        ],
      },
    ],
  },
]);
