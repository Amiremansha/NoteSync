import SignUp from './Components/SignUp'
import Login from './Components/Login'
import HomePage from './Components/HomePage'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { applyTheme, getInitialTheme } from './theme'

function App() {
  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/home" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
