// Vercel serverless entry: all /api/* requests are routed here and handled
// by the Express app. See vercel.json for the rewrite + includeFiles config.
import app from '../server/app.js'

export default app
