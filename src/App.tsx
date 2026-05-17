import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { OAuthConsent } from './pages/OAuthConsent'
import { Login } from './pages/Login'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/oauth/consent" element={<OAuthConsent />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
