import app from './app.js'

const PORT = process.env.PORT || 4000

app.listen(PORT, () => {
  console.log(`\n  Simulator Merchant API running on http://localhost:${PORT}`)
  console.log(`  Health:  http://localhost:${PORT}/api/health`)
  console.log(`  Webhook: http://localhost:${PORT}/api/simulator/hook\n`)
})
