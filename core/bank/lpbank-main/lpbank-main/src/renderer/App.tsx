import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';

import 'tailwindcss/tailwind.css';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<></>} />
      </Routes>
    </Router>
  );
}
