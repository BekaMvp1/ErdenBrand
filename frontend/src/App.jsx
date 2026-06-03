/**
 * Корневой компонент приложения
 */

import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { API_URL } from "./apiBaseUrl";
import { AuthProvider } from "./context/AuthContext";
import { OrderProgressProvider } from "./context/OrderProgressContext";
import { ThemeProvider } from "./context/ThemeContext";
import { FontProvider } from "./context/FontContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CreateOrder from "./pages/CreateOrder";
import OrderDetails from "./pages/OrderDetails";
import PlanningDraft from "./pages/PlanningDraft";
import PlanningMonth from "./pages/PlanningMonth";
import Sewing from "./pages/Sewing";
import Procurement from "./pages/Procurement";
import Dekatirovka from "./pages/Dekatirovka";
import Proverka from "./pages/Proverka";
import PrintProcurement from "./pages/PrintProcurement";
import PrintPlanning from "./pages/PrintPlanning";
import PrintCutting from "./pages/PrintCutting";
import PrintSewing from "./pages/PrintSewing";
import PrintQc from "./pages/PrintQc";
import Cutting from "./pages/Cutting";
import Warehouse from "./pages/Warehouse";
import WarehouseMovements from "./pages/WarehouseMovements";
import WarehouseMovementDocumentForm from "./pages/WarehouseMovementDocumentForm";
import Qc from "./pages/Qc";
import Otk from "./pages/Otk";
import Shipments from "./pages/Shipments";
import Shipping from "./pages/Shipping";
import References from "./pages/References";
import Finance2026 from "./pages/Finance2026";
import Settings from "./pages/Settings";
import ProductionCycleSettings from "./pages/ProductionCycleSettings";
import ProductionChain from "./pages/ProductionChain";
import Dispatcher from "./pages/Dispatcher";
import Assistant from "./pages/Assistant";
import ModelsBase from "./pages/ModelsBase";
import OrdersBoard from "./pages/OrdersBoard";
import ProductionDashboard from "./pages/ProductionDashboard";
import ServerStatus from "./components/ServerStatus";
import StageTabsLayout from "./components/stage/StageTabsLayout";
import ExpensePlan from "./pages/stage/ExpensePlan";
import StageExpensesPlaceholder from "./pages/stage/StageExpensesPlaceholder";
import StageReportsPage from "./pages/stage/StageReportsPage";
import PurchaseReportList from "./pages/stage/PurchaseReportList";
import PurchaseReportForm from "./pages/stage/PurchaseReportForm";
import MovementForm from "./pages/movements/MovementForm";
import Production from "./pages/Production";
import TasksPage from "./pages/TasksPage";
import BarcodesPage from "./pages/BarcodesPage";

export default function App() {
  // Один ping при старте приложения (без setInterval)
  useEffect(() => {
    const base = (API_URL || import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
    const url = base ? `${base}/api/health` : "/api/health";
    fetch(url, { signal: AbortSignal.timeout(30000) }).catch(() => {});
  }, []);

  return (
    <ThemeProvider>
      <FontProvider>
        <AuthProvider>
          <OrderProgressProvider>
          <ServerStatus />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                {/* Главная после логина — Production Dashboard */}
                <Route index element={<Navigate to="/production-dashboard" replace />} />
                <Route path="board" element={<OrdersBoard />} />
                <Route path="orders" element={<Dashboard />} />
                <Route path="production-dashboard" element={<ProductionDashboard />} />
                <Route path="orders/create" element={<CreateOrder />} />
                <Route path="orders/:id" element={<OrderDetails />} />
                <Route path="planning" element={<PlanningDraft />} />
                <Route path="planning/month" element={<PlanningMonth />} />
                <Route path="planning-draft" element={<Navigate to="/planning" replace />} />
                <Route path="planning-week" element={<PlanningDraft viewMode="week" />} />
                <Route path="procurement" element={<StageTabsLayout title="Закуп" />}>
                  <Route index element={<Navigate to="plan" replace />} />
                  <Route path="plan" element={<Procurement />} />
                  <Route path="report" element={<PurchaseReportList />} />
                  <Route path="report/new" element={<PurchaseReportForm />} />
                  <Route path="report/:id" element={<PurchaseReportForm />} />
                  <Route path="expenses" element={<ExpensePlan stage="procurement" />} />
                </Route>
                <Route path="purchase" element={<StageTabsLayout title="Закуп" />}>
                  <Route index element={<Navigate to="plan" replace />} />
                  <Route path="plan" element={<Procurement />} />
                  <Route path="report" element={<PurchaseReportList />} />
                  <Route path="report/new" element={<PurchaseReportForm />} />
                  <Route path="report/:id" element={<PurchaseReportForm />} />
                  <Route path="expenses" element={<ExpensePlan stage="procurement" />} />
                </Route>
                <Route path="production-chain" element={<ProductionChain />} />
                <Route path="production" element={<Production />} />
                <Route path="production/cost" element={<Production />} />
                <Route path="sewing" element={<StageTabsLayout title="Пошив" />}>
                  <Route index element={<Navigate to="plan" replace />} />
                  <Route path="plan" element={<Sewing />} />
                  <Route path="report" element={<StageReportsPage stage="sewing" />} />
                  <Route path="expenses" element={<ExpensePlan stage="sewing" />} />
                </Route>
                <Route path="floor-tasks" element={<Navigate to="/sewing" replace />} />
                <Route path="print/procurement/:id" element={<PrintProcurement />} />
                <Route path="print/planning/:month" element={<PrintPlanning />} />
                <Route path="print/cutting/:id" element={<PrintCutting />} />
                <Route path="print/sewing/:id" element={<PrintSewing />} />
                <Route path="print/qc/:id" element={<PrintQc />} />
                <Route path="cutting" element={<StageTabsLayout title="Раскройный" />}>
                  <Route index element={<Navigate to="plan" replace />} />
                  <Route path="plan" element={<Cutting />} />
                  <Route path="report" element={<StageReportsPage stage="cutting" />} />
                  <Route path="expenses" element={<ExpensePlan stage="cutting" />} />
                </Route>
                <Route path="cutting/:type" element={<Cutting />} />
                <Route path="warehouse" element={<Warehouse />} />
                <Route path="movements/new" element={<MovementForm />} />
                <Route path="movements/:id" element={<MovementForm />} />
                <Route path="warehouse/movements" element={<WarehouseMovements />} />
                <Route path="warehouse/movements/new" element={<WarehouseMovementDocumentForm />} />
                <Route path="warehouse/movements/:id" element={<WarehouseMovementDocumentForm />} />
                <Route path="otk" element={<StageTabsLayout title="ОТК" />}>
                  <Route index element={<Navigate to="plan" replace />} />
                  <Route path="plan" element={<Otk />} />
                  <Route path="report" element={<StageReportsPage stage="otk" />} />
                  <Route path="expenses" element={<ExpensePlan stage="otk" />} />
                </Route>
                <Route path="/dekatirovka" element={<Dekatirovka />} />
                <Route path="/proverka" element={<Proverka />} />
                <Route path="qc" element={<Qc />} />
                <Route path="shipments" element={<Shipments />} />
                <Route path="tasks" element={<TasksPage />} />
                <Route path="shipping-plan" element={<StageTabsLayout title="Отгрузка" />}>
                  <Route index element={<Navigate to="plan" replace />} />
                  <Route path="plan" element={<Shipping />} />
                  <Route path="report" element={<StageReportsPage stage="shipment" />} />
                  <Route path="expenses" element={<StageExpensesPlaceholder />} />
                </Route>
                <Route path="barcodes" element={<BarcodesPage />} />
                <Route path="finance" element={<Finance2026 />} />
                <Route path="references" element={<References />} />
                <Route path="models-base" element={<ModelsBase />} />
                <Route path="settings" element={<Settings />} />
                <Route path="settings/production-cycle" element={<ProductionCycleSettings />} />
                <Route path="dispatcher" element={<Dispatcher />} />
                <Route path="assistant" element={<Assistant />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          </OrderProgressProvider>
        </AuthProvider>
      </FontProvider>
    </ThemeProvider>
  );
}
