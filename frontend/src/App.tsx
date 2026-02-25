import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from '@/pages/Dashboard';
import { PlaybooksPage } from '@/pages/PlaybooksPage';
import { IssueBoardPage } from '@/pages/IssueBoardPage';
import { TaskBoardPage } from '@/pages/TaskBoardPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AgentChat } from '@/components/agent';

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
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/playbooks" element={<PlaybooksPage />} />
          <Route path="/issues" element={<IssueBoardPage />} />
          <Route path="/tasks" element={<TaskBoardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <AgentChat />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
