import { useState, useEffect } from 'react'
import Monetization from './components/monetization/Monetization'
import DogApp from './components/DogApp'

function App() {

  return (
    <Monetization>
      <DogApp />
    </Monetization>
  )
}

export default App