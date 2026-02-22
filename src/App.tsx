import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminPanel from './components/AdminPanel';
import ClientView from './components/ClientView';

export default function App() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Router>
        <Routes>
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/portfolio/:clientId" element={<ClientView />} />
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white">404 - Página não encontrada</div>} />
        </Routes>
      </Router>
    </div>
  );
}
