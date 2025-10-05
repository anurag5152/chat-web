import './App.css';
import Login from './pages/login';
import Signup from './pages/signup';
import Chatpage from './pages/chatpage';
import { Routes, Route, Navigate } from 'react-router-dom';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/signup" replace />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/chatpage" element={<Chatpage />} />
    </Routes>
  );
}

export default App;
