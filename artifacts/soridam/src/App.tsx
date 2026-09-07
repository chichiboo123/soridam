import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { Layout } from '@/components/layout';

import Home from '@/pages/home';
import Library from '@/pages/library';
import Stories from '@/pages/stories';
import StoryEditor from '@/pages/story-editor';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        {/* Editor has its own full screen layout */}
        <Route path="/stories/:id" component={StoryEditor} />
        
        {/* Main app shell */}
        <Route path="/" component={() => <Layout><Home /></Layout>} />
        <Route path="/sounds" component={() => <Layout><Library /></Layout>} />
        <Route path="/stories" component={() => <Layout><Stories /></Layout>} />
        <Route component={() => <Layout><NotFound /></Layout>} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
