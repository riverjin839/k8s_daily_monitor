import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from '@/pages/Dashboard';
import { PlaybooksPage } from '@/pages/PlaybooksPage';
import { IssueBoardPage } from '@/pages/IssueBoardPage';
import { TaskBoardPage } from '@/pages/TaskBoardPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ClusterLinksPage } from '@/pages/ClusterLinksPage';
import { NodeLabelsPage } from '@/pages/NodeLabelsPage';
import { AgentChat } from '@/components/agent';
import { Sidebar } from '@/components/layout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30초
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex min-h-screen bg-background">
          <Sidebar />
          <div className="flex-1 min-w-0 ml-[220px]">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/playbooks" element={<PlaybooksPage />} />
              <Route path="/issues" element={<IssueBoardPage />} />
              <Route path="/tasks" element={<TaskBoardPage />} />
              <Route path="/links" element={<ClusterLinksPage />} />
              <Route path="/node-labels" element={<NodeLabelsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
        <AgentChat />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
