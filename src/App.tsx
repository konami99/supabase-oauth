import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { OAuthConsent } from './pages/OAuthConsent'
import { Login } from './pages/Login'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/oauth/consent" element={<OAuthConsent />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
