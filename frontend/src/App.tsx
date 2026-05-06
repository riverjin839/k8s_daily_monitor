import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from '@/pages/Dashboard';
import { PlaybooksPage } from '@/pages/PlaybooksPage';
import { IssueBoardPage } from '@/pages/IssueBoardPage';
import { IssueFormPage } from '@/pages/IssueFormPage';
import { TaskBoardPage } from '@/pages/TaskBoardPage';
import { TaskFormPage } from '@/pages/TaskFormPage';
import { TodoTodayPage } from '@/pages/TodoTodayPage';
import { MemberBoardPage } from '@/pages/MemberBoardPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ClusterLinksPage } from '@/pages/ClusterLinksPage';
import { NodeLabelsPage } from '@/pages/NodeLabelsPage';
import { NodeImagesPage } from '@/pages/NodeImagesPage';
import { CidrCalculatorPage } from '@/pages/CidrCalculatorPage';
import { ClusterManagePage } from '@/pages/ClusterManagePage';
import { ClusterMetaFormPage } from '@/pages/ClusterMetaFormPage';
import { VersionsPage } from '@/pages/VersionsPage';
import { VersionGraphPage } from '@/pages/VersionGraphPage';
import { BulkExecPage } from '@/pages/BulkExecPage';
import { EtcdCtlPage } from '@/pages/EtcdCtlPage';
import { BatchJobsPage } from '@/pages/BatchJobsPage';
import { KernelParamsPage } from '@/pages/KernelParamsPage';
import { McClientPage } from '@/pages/McClientPage';
import { WorkflowBoardPage } from '@/pages/WorkflowBoardPage';
import { WorkGuidePage } from '@/pages/WorkGuidePage';
import { OpsNotesPage } from '@/pages/OpsNotesPage';
import { MindMapPage } from '@/pages/MindMapPage';
import { WbsFlowPage } from '@/pages/WbsFlowPage';
import { InfraTopologyPage } from '@/pages/InfraTopologyPage';
import { NodeSpecPage } from '@/pages/NodeSpecPage';
import { ServicesCatalogPage } from '@/pages/ServicesCatalogPage';
import { ServiceHubPage } from '@/pages/ServiceHubPage';
import { IncidentAnalysisPage } from '@/pages/IncidentAnalysisPage';
import { PacketFlowPage } from '@/pages/PacketFlowPage';
import { OntologyPage } from '@/pages/OntologyPage';
import { TrendDigestPage } from '@/pages/TrendDigestPage';
import { AgentChat } from '@/components/agent';
import { Sidebar } from '@/components/layout';
import { NAV_WIDTH } from '@/stores/sidebarStore';
import { ToastProvider } from '@/components/common';
import { AuthGate } from '@/components/auth/AuthGate';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30초
      retry: 1,
    },
  },
});

function AppShell() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div
        className="flex-1 min-w-0"
        style={{ marginLeft: NAV_WIDTH }}
      >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/playbooks" element={<PlaybooksPage />} />
              <Route path="/issues" element={<IssueBoardPage />} />
              <Route path="/issues/new" element={<IssueFormPage />} />
              <Route path="/issues/:id/edit" element={<IssueFormPage />} />
              <Route path="/tasks" element={<TaskBoardPage />} />
              <Route path="/tasks/new" element={<TaskFormPage />} />
              <Route path="/tasks/:id/edit" element={<TaskFormPage />} />
              <Route path="/todo-today" element={<TodoTodayPage />} />
              <Route path="/members" element={<MemberBoardPage />} />
              <Route path="/links" element={<ClusterLinksPage />} />
              <Route path="/node-labels" element={<NodeLabelsPage />} />
              <Route path="/node-images" element={<NodeImagesPage />} />
              <Route path="/cidr" element={<CidrCalculatorPage />} />
              <Route path="/cluster-manage" element={<ClusterManagePage />} />
              <Route path="/cluster-manage/:id/edit" element={<ClusterMetaFormPage />} />
              <Route path="/versions" element={<VersionsPage />} />
              <Route path="/versions/:clusterId/graph" element={<VersionGraphPage />} />
              <Route path="/bulk-exec" element={<BulkExecPage />} />
              <Route path="/etcdctl" element={<EtcdCtlPage />} />
              <Route path="/batch-jobs" element={<BatchJobsPage />} />
              <Route path="/kernel-params" element={<KernelParamsPage />} />
              <Route path="/mc" element={<McClientPage />} />
              <Route path="/infra-topology" element={<InfraTopologyPage />} />
              <Route path="/node-specs" element={<NodeSpecPage />} />
              <Route path="/services" element={<ServicesCatalogPage />} />
              <Route path="/services/:service" element={<ServiceHubPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/workflow" element={<WorkflowBoardPage />} />
              <Route path="/work-guides" element={<WorkGuidePage />} />
              <Route path="/ops-notes" element={<OpsNotesPage />} />
              <Route path="/mindmap" element={<MindMapPage />} />
              <Route path="/wbs" element={<WbsFlowPage />} />
              <Route path="/incident-analysis" element={<IncidentAnalysisPage />} />
              <Route path="/packet-flow" element={<PacketFlowPage />} />
              <Route path="/ontology" element={<OntologyPage />} />
              <Route path="/trends" element={<TrendDigestPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthGate>
            <AppShell />
            <AgentChat />
          </AuthGate>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
