import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { VerticalProvider } from "./contexts/VerticalContext";
import Dashboard from "./pages/Dashboard";
import Checkout from "./pages/Checkout";
import Transactions from "./pages/Transactions";
import Receivables from "./pages/Receivables";
import Payables from "./pages/Payables";
import CashManagement from "./pages/CashManagement";
import AuditFiscal from "./pages/AuditFiscal";
import MindOSDashboard from "./pages/MindOSDashboard";
import SchedulingSettings from "./pages/SchedulingSettings";
import Agenda from "./pages/Agenda";
import Patients from "./pages/Patients";
import Patient360 from "./pages/Patient360";
import AdminStudio from "./pages/AdminStudio";
import ClinicalRecord from "./pages/ClinicalRecord";
import Reception from "./pages/Reception";
import PatientPortal from "./pages/PatientPortal";
import OnlineBooking from "./pages/OnlineBooking";
import Team from "./pages/Team";
import AcceptInvite from "./pages/AcceptInvite";

function Router() {
  return (
    <Switch>
      <Route path="/" component={MindOSDashboard} />
      <Route path="/finance" component={Dashboard} />
      <Route path="/agenda" component={Agenda} />
      <Route path="/app/scheduling" component={SchedulingSettings} />
      <Route path="/patients" component={Patients} />
      <Route path="/patients/view" component={Patient360} />
      <Route path="/clinical-records" component={ClinicalRecord} />
      <Route path="/reception" component={Reception} />
      <Route path="/portal" component={PatientPortal} />
      <Route path="/book" component={OnlineBooking} />
      <Route path="/app/admin-studio" component={AdminStudio} />
      <Route path="/app/team" component={Team} />
      <Route path="/invite" component={AcceptInvite} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/transactions" component={Transactions} />
      <Route path="/receivables" component={Receivables} />
      <Route path="/payables" component={Payables} />
      <Route path="/cash" component={CashManagement} />
      <Route path="/audit" component={AuditFiscal} />
      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <VerticalProvider>
          <TooltipProvider>
            <Toaster position="top-right" richColors />
            <Router />
          </TooltipProvider>
        </VerticalProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
