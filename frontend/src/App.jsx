/**
 * Корневой компонент приложения
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import Sewing from "./pages/Sewing";
import Procurement from "./pages/Procurement";
import PrintProcurement from "./pages/PrintProcurement";
import PrintPlanning from "./pages/PrintPlanning";
import PrintCutting from "./pages/PrintCutting";
import PrintSewing from "./pages/PrintSewing";
import PrintQc from "./pages/PrintQc";
import Cutting from "./pages/Cutting";
import Warehouse from "./pages/Warehouse";
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
import OrdersBoard from "./pages/OrdersBoard";
import ProductionDashboard from "./pages/ProductionDashboard";

export default function App() {
  return (
    <ThemeProvider>
      <FontProvider>
        <AuthProvider>
          <OrderProgressProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
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
                <Route path="planning-draft" element={<Navigate to="/planning" replace />} />
                <Route path="planning-week" element={<PlanningDraft viewMode="week" />} />
                <Route path="production-chain" element={<ProductionChain />} />
                <Route path="sewing" element={<Sewing />} />
                <Route path="floor-tasks" element={<Navigate to="/sewing" replace />} />
                <Route path="procurement" element={<Procurement />} />
                <Route path="print/procurement/:id" element={<PrintProcurement />} />
                <Route path="print/planning/:month" element={<PrintPlanning />} />
                <Route path="print/cutting/:id" element={<PrintCutting />} />
                <Route path="print/sewing/:id" element={<PrintSewing />} />
                <Route path="print/qc/:id" element={<PrintQc />} />
                <Route path="cutting" element={<Cutting />} />
                <Route path="cutting/:type" element={<Cutting />} />
                <Route path="warehouse" element={<Warehouse />} />
                <Route path="otk" element={<Otk />} />
                <Route path="qc" element={<Qc />} />
                <Route path="shipments" element={<Shipments />} />
                <Route path="shipping-plan" element={<Shipping />} />
                <Route path="finance" element={<Finance2026 />} />
                <Route path="references" element={<References />} />
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
