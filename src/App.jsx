import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Landing from './screens/Landing.jsx'
import HostView from './screens/host/HostView.jsx'
import PlayerView from './screens/player/PlayerView.jsx'

export default function App() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Landing />} />
        <Route path="/host" element={<HostView />} />
        <Route path="/play" element={<PlayerView />} />
      </Routes>
    </AnimatePresence>
  )
}
